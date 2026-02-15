// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";
import "./RiskController.sol";
import "./interfaces/IDexStrategy.sol";

/// @title TreasuryVault
/// @notice Segregated institutional stablecoin treasury
contract TreasuryVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;
    RiskController public immutable riskController;

    uint256 public immutable vaultId;
    address public owner;

    mapping(address => uint256) public tokenBalances;
    mapping(address => uint256) public deployedCapital;
    mapping(bytes32 => uint256) public pairExposure;
    mapping(address => bool) public approvedStrategies;
    mapping(address => bool) public approvedTokens;

    uint256 public activeDeployments;
    uint256 public immutable createdAt;

    address public feeTreasury;
    uint16 public performanceFeeBps;
    uint16 public managementFeeBps;

    mapping(address => uint256) public accruedPerformanceFees;
    mapping(address => uint256) public accruedManagementFees;
    mapping(address => uint256) public lastFeeAccrualTimestamp;
    mapping(address => uint256) public realizedLosses;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct Deployment {
        address strategy;
        address token;
        uint256 amount;
        bytes32 pairId;
        uint256 timestamp;
        bool active;
    }

    mapping(uint256 => Deployment) public deployments;
    uint256 public nextDeploymentId;

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error TokenNotApproved(address token);
    error StrategyNotApproved(address strategy);
    error InsufficientBalance(uint256 available, uint256 requested);
    error DeploymentNotActive(uint256 deploymentId);
    error ZeroAmount();
    error NotVaultOwner();
    error BalanceConsistencyViolation(address token, uint256 expected, uint256 actual);
    error FeeTreasuryNotSet();

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event Deposited(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        address indexed depositor,
        uint256 newBalance
    );

    event Withdrawn(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        address indexed recipient,
        uint256 newBalance
    );

    event CapitalDeployed(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        address indexed strategy,
        address token,
        uint256 amount,
        bytes32 pairId
    );

    event CapitalRecalled(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        uint256 returnedAmount
    );

    event StrategyApproved(address indexed strategy, bool approved);
    event TokenApproved(address indexed token, bool approved);

    event LossRealized(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        address indexed token,
        uint256 deployedAmount,
        uint256 returnedAmount,
        uint256 loss
    );

    event PerformanceFeeAccrued(
        uint256 indexed vaultId,
        address indexed token,
        uint256 yieldAmount,
        uint256 feeAmount
    );

    event ManagementFeeAccrued(
        uint256 indexed vaultId,
        address indexed token,
        uint256 feeAmount,
        uint256 periodSeconds
    );

    event FeesDistributed(
        uint256 indexed vaultId,
        address indexed token,
        uint256 performanceFee,
        uint256 managementFee,
        address indexed recipient
    );

    event EmergencyReturnReceived(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        bytes32 indexed pairId
    );

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier onlyOwnerOrManager() {
        if (msg.sender != owner) {
            governance.checkRole(governance.TREASURY_MANAGER_ROLE(), msg.sender);
        }
        _;
    }

    modifier whenNotPaused() {
        if (riskController.paused()) revert RiskController.ProtocolPaused();
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(
        uint256 _vaultId,
        address _owner,
        address _governance,
        address _riskController
    ) {
        vaultId = _vaultId;
        owner = _owner;
        governance = GovernanceRoles(_governance);
        riskController = RiskController(_riskController);
        createdAt = block.timestamp;
    }

    // ---------------------------------------------------------------
    // Token and Strategy Management
    // ---------------------------------------------------------------

    function setApprovedToken(address token, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    function setApprovedStrategy(address strategy, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedStrategies[strategy] = approved;
        emit StrategyApproved(strategy, approved);
    }

    // ---------------------------------------------------------------
    // Deposit
    // ---------------------------------------------------------------

    function deposit(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyOwnerOrManager
    {
        if (amount == 0) revert ZeroAmount();
        if (!approvedTokens[token]) revert TokenNotApproved(token);

        accrueManagementFee(token);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;

        emit Deposited(vaultId, token, amount, msg.sender, tokenBalances[token]);
    }

    // ---------------------------------------------------------------
    // Withdraw
    // ---------------------------------------------------------------

    function withdraw(address token, uint256 amount, address recipient)
        external
        nonReentrant
        whenNotPaused
        onlyOwnerOrManager
    {
        if (amount == 0) revert ZeroAmount();

        accrueManagementFee(token);

        uint256 available = tokenBalances[token] - deployedCapital[token]
            - accruedPerformanceFees[token] - accruedManagementFees[token];
        if (amount > available) revert InsufficientBalance(available, amount);

        tokenBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit Withdrawn(vaultId, token, amount, recipient, tokenBalances[token]);

        _assertBalanceConsistency(token);
    }

    // ---------------------------------------------------------------
    // Strategy Deployment
    // ---------------------------------------------------------------

    function deployToStrategy(
        address strategy,
        address token,
        uint256 amount,
        bytes32 pairId
    )
        external
        nonReentrant
        whenNotPaused
        onlyRole(governance.TREASURY_MANAGER_ROLE())
        returns (uint256 deploymentId)
    {
        if (amount == 0) revert ZeroAmount();
        if (!approvedStrategies[strategy]) revert StrategyNotApproved(strategy);
        if (!approvedTokens[token]) revert TokenNotApproved(token);

        uint256 available = tokenBalances[token] - deployedCapital[token];
        if (amount > available) revert InsufficientBalance(available, amount);

        riskController.validateOrderPlacement(
            pairId,
            0,
            amount,
            tokenBalances[token],
            pairExposure[pairId],
            0
        );

        deployedCapital[token] += amount;
        pairExposure[pairId] += amount;

        IERC20(token).safeTransfer(strategy, amount);

        deploymentId = nextDeploymentId++;
        deployments[deploymentId] = Deployment({
            strategy: strategy,
            token: token,
            amount: amount,
            pairId: pairId,
            timestamp: block.timestamp,
            active: true
        });
        activeDeployments++;

        IDexStrategy(strategy).acceptDeployment(deploymentId, pairId);

        emit CapitalDeployed(vaultId, deploymentId, strategy, token, amount, pairId);
    }

    function recallFromStrategy(uint256 deploymentId)
        external
        nonReentrant
        whenNotPaused
    {
        Deployment storage d = deployments[deploymentId];
        if (!d.active) revert DeploymentNotActive(deploymentId);
        if (msg.sender != d.strategy) revert StrategyNotApproved(msg.sender);

        uint256 strategyBalance = IERC20(d.token).balanceOf(msg.sender);

        d.active = false;
        activeDeployments--;

        if (d.amount <= deployedCapital[d.token]) {
            deployedCapital[d.token] -= d.amount;
        } else {
            deployedCapital[d.token] = 0;
        }

        if (d.amount <= pairExposure[d.pairId]) {
            pairExposure[d.pairId] -= d.amount;
        } else {
            pairExposure[d.pairId] = 0;
        }

        uint256 returnedAmount = strategyBalance;
        IERC20(d.token).safeTransferFrom(msg.sender, address(this), returnedAmount);

        // Correct accounting: tokenBalances already includes deployed capital
        // Only adjust for actual gains/losses
        if (returnedAmount < d.amount) {
            // Loss: reduce tokenBalances by the loss amount
            uint256 loss = d.amount - returnedAmount;
            realizedLosses[d.token] += loss;
            tokenBalances[d.token] -= loss;
            emit LossRealized(vaultId, deploymentId, d.token, d.amount, returnedAmount, loss);
        } else if (returnedAmount > d.amount) {
            // Profit: increase tokenBalances by net yield after fees
            uint256 yield_ = returnedAmount - d.amount;
            uint256 fee = (yield_ * performanceFeeBps) / 10000;
            accruedPerformanceFees[d.token] += fee;
            tokenBalances[d.token] += (yield_ - fee);
            emit PerformanceFeeAccrued(vaultId, d.token, yield_, fee);
        }
        // Break-even: no change to tokenBalances needed

        emit CapitalRecalled(vaultId, deploymentId, returnedAmount);

        _assertBalanceConsistency(d.token);
    }

    function receiveEmergencyReturn(bytes32 pairId, address token, uint256 amount)
        external
        nonReentrant
    {
        if (!approvedStrategies[msg.sender]) revert StrategyNotApproved(msg.sender);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        if (amount <= pairExposure[pairId]) {
            pairExposure[pairId] -= amount;
        } else {
            pairExposure[pairId] = 0;
        }

        if (amount <= deployedCapital[token]) {
            deployedCapital[token] -= amount;
        } else {
            deployedCapital[token] = 0;
        }

        tokenBalances[token] += amount;

        emit EmergencyReturnReceived(vaultId, token, amount, pairId);
    }

    // ---------------------------------------------------------------
    // Fee Management
    // ---------------------------------------------------------------

    function setFeeConfig(
        address _feeTreasury,
        uint16 _performanceFeeBps,
        uint16 _managementFeeBps
    ) external onlyRole(governance.ADMIN_ROLE()) {
        if (_feeTreasury == address(0)) revert FeeTreasuryNotSet();
        if (_performanceFeeBps > 5000) revert RiskController.InvalidParams();
        if (_managementFeeBps > 500) revert RiskController.InvalidParams();
        feeTreasury = _feeTreasury;
        performanceFeeBps = _performanceFeeBps;
        managementFeeBps = _managementFeeBps;
    }

    function accrueManagementFee(address token) public {
        uint256 lastAccrual = lastFeeAccrualTimestamp[token];
        if (lastAccrual == 0) {
            lastFeeAccrualTimestamp[token] = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0) return;

        uint256 netAum = tokenBalances[token] - deployedCapital[token]
            - accruedPerformanceFees[token] - accruedManagementFees[token];
        uint256 fee = (netAum * managementFeeBps * elapsed) / (10000 * 365 days);

        if (fee > 0 && fee <= netAum) {
            accruedManagementFees[token] += fee;
            tokenBalances[token] -= fee;
            emit ManagementFeeAccrued(vaultId, token, fee, elapsed);
        }

        lastFeeAccrualTimestamp[token] = block.timestamp;
    }

    function distributeFees(address token) external nonReentrant onlyRole(governance.ADMIN_ROLE()) {
        if (feeTreasury == address(0)) revert FeeTreasuryNotSet();

        uint256 perfFee = accruedPerformanceFees[token];
        uint256 mgmtFee = accruedManagementFees[token];
        uint256 totalFee = perfFee + mgmtFee;
        if (totalFee == 0) return;

        accruedPerformanceFees[token] = 0;
        accruedManagementFees[token] = 0;

        IERC20(token).safeTransfer(feeTreasury, totalFee);

        emit FeesDistributed(vaultId, token, perfFee, mgmtFee, feeTreasury);
        _assertBalanceConsistency(token);
    }

    function _assertBalanceConsistency(address token) internal view {
        uint256 expectedMinBalance = tokenBalances[token] - deployedCapital[token]
            + accruedPerformanceFees[token] + accruedManagementFees[token];
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        if (actualBalance < expectedMinBalance) {
            revert BalanceConsistencyViolation(token, expectedMinBalance, actualBalance);
        }
    }

    // ---------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------

    function availableBalance(address token) external view returns (uint256) {
        return tokenBalances[token] - deployedCapital[token];
    }

    function utilizationBps(address token) external view returns (uint16) {
        if (tokenBalances[token] == 0) return 0;
        return uint16((deployedCapital[token] * 10000) / tokenBalances[token]);
    }
}
