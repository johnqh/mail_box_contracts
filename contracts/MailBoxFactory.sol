// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MailBoxFactory
 * @notice Factory contract for deterministic deployment of MailBox contracts using CREATE2
 * @dev Enables identical contract addresses across multiple EVM chains
 * @author MailBox Team
 */

import "./interfaces/IERC20.sol";
import "./Mailer.sol";
import "./MailService.sol";

contract MailBoxFactory {
    /// @notice Emitted when a Mailer contract is deployed
    /// @param mailer Address of the deployed Mailer contract
    /// @param usdcToken USDC token address used
    /// @param owner Owner address of the deployed contract
    /// @param salt Salt value used for CREATE2
    event MailerDeployed(
        address indexed mailer,
        address indexed usdcToken,
        address indexed owner,
        bytes32 salt
    );

    /// @notice Emitted when a MailService contract is deployed
    /// @param mailService Address of the deployed MailService contract
    /// @param usdcToken USDC token address used
    /// @param owner Owner address of the deployed contract
    /// @param salt Salt value used for CREATE2
    event MailServiceDeployed(
        address indexed mailService,
        address indexed usdcToken,
        address indexed owner,
        bytes32 salt
    );

    /// @notice Thrown when deployment fails
    error DeploymentFailed();
    
    /// @notice Thrown when contract already exists at predicted address
    error ContractAlreadyDeployed();
    
    /// @notice Thrown when invalid parameters provided
    error InvalidParameters();

    /**
     * @notice Deploy a Mailer contract using CREATE2
     * @param usdcToken Address of the USDC token contract
     * @param owner Address that will own the deployed contract
     * @param salt Salt value for deterministic deployment
     * @return mailer Address of the deployed Mailer contract
     */
    function deployMailer(
        address usdcToken,
        address owner,
        bytes32 salt
    ) external returns (address mailer) {
        if (usdcToken == address(0) || owner == address(0)) {
            revert InvalidParameters();
        }

        // Check if already deployed
        address predictedAddress = predictMailerAddress(usdcToken, owner, salt);
        if (_isContract(predictedAddress)) {
            revert ContractAlreadyDeployed();
        }

        // Deploy using CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(Mailer).creationCode,
            abi.encode(usdcToken, owner)
        );

        assembly {
            mailer := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        if (mailer == address(0)) {
            revert DeploymentFailed();
        }

        emit MailerDeployed(mailer, usdcToken, owner, salt);
    }

    /**
     * @notice Deploy a MailService contract using CREATE2
     * @param usdcToken Address of the USDC token contract
     * @param owner Address that will own the deployed contract
     * @param salt Salt value for deterministic deployment
     * @return mailService Address of the deployed MailService contract
     */
    function deployMailService(
        address usdcToken,
        address owner,
        bytes32 salt
    ) external returns (address mailService) {
        if (usdcToken == address(0) || owner == address(0)) {
            revert InvalidParameters();
        }

        // Check if already deployed
        address predictedAddress = predictMailServiceAddress(usdcToken, owner, salt);
        if (_isContract(predictedAddress)) {
            revert ContractAlreadyDeployed();
        }

        // Deploy using CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(MailService).creationCode,
            abi.encode(usdcToken, owner)
        );

        assembly {
            mailService := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        if (mailService == address(0)) {
            revert DeploymentFailed();
        }

        emit MailServiceDeployed(mailService, usdcToken, owner, salt);
    }

    /**
     * @notice Deploy both Mailer and MailService contracts in a single transaction
     * @param usdcToken Address of the USDC token contract
     * @param owner Address that will own both deployed contracts
     * @param mailerSalt Salt value for Mailer deployment
     * @param mailServiceSalt Salt value for MailService deployment
     * @return mailer Address of the deployed Mailer contract
     * @return mailService Address of the deployed MailService contract
     */
    function deployBoth(
        address usdcToken,
        address owner,
        bytes32 mailerSalt,
        bytes32 mailServiceSalt
    ) external returns (address mailer, address mailService) {
        mailer = this.deployMailer(usdcToken, owner, mailerSalt);
        mailService = this.deployMailService(usdcToken, owner, mailServiceSalt);
    }

    /**
     * @notice Predict the address of a Mailer contract before deployment
     * @param usdcToken Address of the USDC token contract
     * @param owner Address that will own the deployed contract
     * @param salt Salt value for deterministic deployment
     * @return predicted The predicted address of the Mailer contract
     */
    function predictMailerAddress(
        address usdcToken,
        address owner,
        bytes32 salt
    ) public view returns (address predicted) {
        bytes memory bytecode = abi.encodePacked(
            type(Mailer).creationCode,
            abi.encode(usdcToken, owner)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        predicted = address(uint160(uint256(hash)));
    }

    /**
     * @notice Predict the address of a MailService contract before deployment
     * @param usdcToken Address of the USDC token contract
     * @param owner Address that will own the deployed contract
     * @param salt Salt value for deterministic deployment
     * @return predicted The predicted address of the MailService contract
     */
    function predictMailServiceAddress(
        address usdcToken,
        address owner,
        bytes32 salt
    ) public view returns (address predicted) {
        bytes memory bytecode = abi.encodePacked(
            type(MailService).creationCode,
            abi.encode(usdcToken, owner)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        predicted = address(uint160(uint256(hash)));
    }

    /**
     * @notice Generate a deterministic salt based on project parameters
     * @param projectName Name of the project
     * @param version Version identifier
     * @param contractType Type of contract (e.g., "Mailer" or "MailService")
     * @return salt Generated salt for CREATE2 deployment
     */
    function generateSalt(
        string memory projectName,
        string memory version,
        string memory contractType
    ) public pure returns (bytes32 salt) {
        salt = keccak256(abi.encodePacked(projectName, version, contractType));
    }

    /**
     * @notice Check if a contract exists at a given address
     * @param addr Address to check
     * @return exists True if a contract exists at the address
     */
    function isContractDeployed(address addr) external view returns (bool exists) {
        return _isContract(addr);
    }

    /**
     * @notice Internal function to check if address contains contract code
     * @param addr Address to check
     * @return True if address contains code
     */
    function _isContract(address addr) private view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}