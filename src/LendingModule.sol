// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";

/// @title LendingModule
/// @notice Fixed-term stablecoin lending pools funded by TreasuryVault deployments
contract LendingModule is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    uint256 public constant TERM_30_DAYS = 30 days;
    uint256 public constant TERM_60_DAYS = 60 days;
    uint256 public constant TERM_90_DAYS = 90 days;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_COLLATERAL_RATIO_BPS = 12000;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;

    mapping(uint256 => uint16) public termRatesBps;
    mapping(uint256 => LoanPosition) public positions;
    uint256 public nextPositionId;

    mapping(address => uint256) public principalPool;
    mapping(address => uint256) public totalActiveLending;
    mapping(address => uint256) public interestPool;
    mapping(address => bool) public approvedVaults;
    mapping(address => bool) public approvedBorrowers;

    address public collateralToken;
    mapping(address => uint256) public collateralBalances;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct LoanPosition {
        address borrower;
        address token;
        uint256 principal;
        uint16 rateBps;
        uint256 term;
        uint256 startTimestamp;
        uint256 maturityTimestamp;
        uint256 collateralAmount;
        bool repaid;
        bool liquidated;
        bool active;
    }

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error InvalidTerm(uint256 term);
    error PositionNotMature(uint256 maturity, uint256 currentTime);
    error PositionAlreadyClaimed(uint256 positionId);
    error PositionNotActive(uint256 positionId);
    error NotPositionOwner(address caller, address owner);
    error ZeroAmount();
    error RateNotSet(uint256 term);
    error VaultNotApproved(address vault);
    error BorrowerNotApproved(address borrower);
    error InsufficientLendableCapital(uint256 available, uint256 requested);
    error InsufficientCollateral(uint256 provided, uint256 required);
    error LoanNotOverdue(uint256 maturity);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event CapitalSupplied(address indexed vault, address indexed token, uint256 amount);
    event CapitalWithdrawn(address indexed vault, address indexed token, uint256 fromPrincipal, uint256 fromInterest);
    event LoanOriginated(
        uint256 indexed positionId,
        address indexed borrower,
        address indexed token,
        uint256 principal,
        uint16 rateBps,
        uint256 term,
        uint256 collateralAmount
    );
    event LoanRepaid(
        uint256 indexed positionId,
        address indexed borrower,
        uint256 principal,
        uint256 interest
    );
    event LoanLiquidated(
        uint256 indexed positionId,
        address indexed borrower,
        uint256 collateralSeized
    );
    event TermRateUpdated(uint256 term, uint16 rateBps);

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier onlyApprovedVault() {
        if (!approvedVaults[msg.sender]) revert VaultNotApproved(msg.sender);
        _;
    }

    modifier onlyApprovedBorrower() {
        if (!approvedBorrowers[msg.sender]) revert BorrowerNotApproved(msg.sender);
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(address _governance, address _collateralToken) {
        governance = GovernanceRoles(_governance);
        collateralToken = _collateralToken;
    }

    // ---------------------------------------------------------------
    // Admin Functions
    // ---------------------------------------------------------------

    function setTermRate(uint256 term, uint16 rateBps)
        external onlyRole(governance.ADMIN_ROLE())
    {
        if (term != TERM_30_DAYS && term != TERM_60_DAYS && term != TERM_90_DAYS) {
            revert InvalidTerm(term);
        }
        termRatesBps[term] = rateBps;
        emit TermRateUpdated(term, rateBps);
    }

    function setApprovedVault(address vault_, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedVaults[vault_] = approved;
    }

    function setApprovedBorrower(address borrower, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedBorrowers[borrower] = approved;
    }

    // ---------------------------------------------------------------
    // Capital Supply
    // ---------------------------------------------------------------

    function supplyCapital(address token, uint256 amount)
        external nonReentrant onlyApprovedVault
    {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        principalPool[token] += amount;
        emit CapitalSupplied(msg.sender, token, amount);
    }

    function withdrawCapital(address token, uint256 amount)
        external nonReentrant onlyApprovedVault
    {
        if (amount == 0) revert ZeroAmount();
        uint256 availablePrincipal = principalPool[token] - totalActiveLending[token];
        uint256 availableInterest = interestPool[token];
        uint256 totalAvailable = availablePrincipal + availableInterest;
        if (amount > totalAvailable) revert InsufficientLendableCapital(totalAvailable, amount);

        uint256 fromPrincipal = amount <= availablePrincipal ? amount : availablePrincipal;
        uint256 fromInterest = amount - fromPrincipal;

        principalPool[token] -= fromPrincipal;
        interestPool[token] -= fromInterest;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit CapitalWithdrawn(msg.sender, token, fromPrincipal, fromInterest);
    }

    // ---------------------------------------------------------------
    // Borrowing
    // ---------------------------------------------------------------

    function borrow(
        address token,
        uint256 amount,
        uint256 term,
        uint256 collateralAmount
    )
        external nonReentrant onlyApprovedBorrower returns (uint256 positionId)
    {
        if (amount == 0) revert ZeroAmount();
        if (term != TERM_30_DAYS && term != TERM_60_DAYS && term != TERM_90_DAYS) {
            revert InvalidTerm(term);
        }
        if (termRatesBps[term] == 0) revert RateNotSet(term);

        uint256 available = principalPool[token] - totalActiveLending[token];
        if (amount > available) revert InsufficientLendableCapital(available, amount);

        uint256 requiredCollateral = (amount * MIN_COLLATERAL_RATIO_BPS) / BPS_DENOMINATOR;
        if (collateralAmount < requiredCollateral) {
            revert InsufficientCollateral(collateralAmount, requiredCollateral);
        }

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);
        collateralBalances[msg.sender] += collateralAmount;

        positionId = nextPositionId++;
        positions[positionId] = LoanPosition({
            borrower: msg.sender,
            token: token,
            principal: amount,
            rateBps: termRatesBps[term],
            term: term,
            startTimestamp: block.timestamp,
            maturityTimestamp: block.timestamp + term,
            collateralAmount: collateralAmount,
            repaid: false,
            liquidated: false,
            active: true
        });

        totalActiveLending[token] += amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit LoanOriginated(
            positionId, msg.sender, token, amount,
            termRatesBps[term], term, collateralAmount
        );
    }

    function repay(uint256 positionId) external nonReentrant {
        LoanPosition storage pos = positions[positionId];
        if (!pos.active) revert PositionNotActive(positionId);
        if (msg.sender != pos.borrower) revert NotPositionOwner(msg.sender, pos.borrower);

        uint256 interest = calculateInterest(pos.principal, pos.rateBps, pos.term);
        uint256 totalRepayment = pos.principal + interest;

        pos.repaid = true;
        pos.active = false;
        totalActiveLending[pos.token] -= pos.principal;
        interestPool[pos.token] += interest;

        IERC20(pos.token).safeTransferFrom(msg.sender, address(this), totalRepayment);

        uint256 collateral = pos.collateralAmount;
        collateralBalances[msg.sender] -= collateral;
        IERC20(collateralToken).safeTransfer(msg.sender, collateral);

        emit LoanRepaid(positionId, msg.sender, pos.principal, interest);
    }

    function liquidate(uint256 positionId)
        external nonReentrant onlyRole(governance.RISK_OFFICER_ROLE())
    {
        LoanPosition storage pos = positions[positionId];
        if (!pos.active) revert PositionNotActive(positionId);
        if (block.timestamp < pos.maturityTimestamp + 3 days) {
            revert LoanNotOverdue(pos.maturityTimestamp);
        }

        pos.liquidated = true;
        pos.active = false;
        totalActiveLending[pos.token] -= pos.principal;

        uint256 collateral = pos.collateralAmount;
        collateralBalances[pos.borrower] -= collateral;

        emit LoanLiquidated(positionId, pos.borrower, collateral);
    }

    // ---------------------------------------------------------------
    // Interest Calculation
    // ---------------------------------------------------------------

    function calculateInterest(uint256 principal, uint16 rateBps, uint256 term)
        public pure returns (uint256)
    {
        return (principal * uint256(rateBps) * term) / (365 days * BPS_DENOMINATOR);
    }

    // ---------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------

    function getPosition(uint256 positionId) external view returns (LoanPosition memory) {
        return positions[positionId];
    }

    function isMatured(uint256 positionId) external view returns (bool) {
        return block.timestamp >= positions[positionId].maturityTimestamp;
    }

    function availableToLend(address token) external view returns (uint256) {
        return principalPool[token] - totalActiveLending[token];
    }
}
