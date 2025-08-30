import { expect } from 'chai';
import { PublicKey, Keypair } from '@solana/web3.js';
import { 
    formatUSDC, 
    parseUSDC, 
    USDC_DECIMALS, 
    CLAIM_PERIOD_DAYS, 
    NETWORK_CONFIGS,
    ClaimableInfo,
    DelegationInfo,
    DeploymentConfig,
    MailServiceFees,
    MailerFees
} from '../app/types';

describe('Types and Utilities', () => {
    describe('USDC Formatting and Parsing', () => {
        it('Should format USDC amounts correctly', () => {
            expect(formatUSDC(0)).to.equal('0.00');
            expect(formatUSDC(1)).to.equal('0.00'); // 1 micro USDC
            expect(formatUSDC(1000)).to.equal('0.00'); // 0.001 USDC
            expect(formatUSDC(10000)).to.equal('0.01'); // 0.01 USDC
            expect(formatUSDC(100000)).to.equal('0.10'); // 0.1 USDC
            expect(formatUSDC(1000000)).to.equal('1.00'); // 1 USDC
            expect(formatUSDC(1500000)).to.equal('1.50'); // 1.5 USDC
            expect(formatUSDC(100000000)).to.equal('100.00'); // 100 USDC
            expect(formatUSDC(999999999)).to.equal('1000.00'); // 999.999999 USDC rounded to 1000.00
        });

        it('Should parse USDC amounts correctly', () => {
            expect(parseUSDC('0')).to.equal(0);
            expect(parseUSDC('0.00')).to.equal(0);
            expect(parseUSDC('0.01')).to.equal(10000);
            expect(parseUSDC('0.10')).to.equal(100000);
            expect(parseUSDC('1')).to.equal(1000000);
            expect(parseUSDC('1.00')).to.equal(1000000);
            expect(parseUSDC('1.50')).to.equal(1500000);
            expect(parseUSDC('100')).to.equal(100000000);
            expect(parseUSDC('999.99')).to.equal(999990000);
        });

        it('Should handle edge cases in formatting', () => {
            expect(formatUSDC(999999)).to.equal('1.00'); // 0.999999 USDC rounded to 1.00
            expect(formatUSDC(1000001)).to.equal('1.00'); // Just over 1 USDC
            expect(formatUSDC(Number.MAX_SAFE_INTEGER)).to.be.a('string');
        });

        it('Should handle edge cases in parsing', () => {
            expect(parseUSDC('0.001')).to.equal(1000); // 3 decimal places
            expect(parseUSDC('0.0001')).to.equal(100); // 4 decimal places
            expect(parseUSDC('0.00001')).to.equal(10); // 5 decimal places
            expect(parseUSDC('0.000001')).to.equal(1); // 6 decimal places (minimum)
            expect(parseUSDC('0.0000001')).to.equal(0); // 7 decimal places (truncated)
        });

        it('Should be reversible for valid inputs', () => {
            const testAmounts = [0, 10000, 100000, 1000000, 1500000, 100000000];
            
            testAmounts.forEach(amount => {
                const formatted = formatUSDC(amount);
                const parsed = parseUSDC(formatted);
                expect(parsed).to.equal(amount);
            });
        });
    });

    describe('Constants', () => {
        it('Should have correct USDC decimals', () => {
            expect(USDC_DECIMALS).to.equal(6);
            expect(typeof USDC_DECIMALS).to.equal('number');
        });

        it('Should have correct claim period', () => {
            expect(CLAIM_PERIOD_DAYS).to.equal(60);
            expect(typeof CLAIM_PERIOD_DAYS).to.equal('number');
        });

        it('Should have valid network configurations', () => {
            expect(NETWORK_CONFIGS).to.be.an('object');
            
            // Check mainnet-beta config
            expect(NETWORK_CONFIGS['mainnet-beta']).to.be.an('object');
            expect(NETWORK_CONFIGS['mainnet-beta'].usdcMint).to.be.instanceOf(PublicKey);
            expect(NETWORK_CONFIGS['mainnet-beta'].usdcMint.toString()).to.equal('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
            
            // Check devnet config
            expect(NETWORK_CONFIGS['devnet']).to.be.an('object');
            expect(NETWORK_CONFIGS['devnet'].usdcMint).to.be.instanceOf(PublicKey);
            expect(NETWORK_CONFIGS['devnet'].usdcMint.toString()).to.equal('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
            
            // Check testnet config
            expect(NETWORK_CONFIGS['testnet']).to.be.an('object');
            expect(NETWORK_CONFIGS['testnet'].usdcMint).to.be.instanceOf(PublicKey);
        });
    });

    describe('Interface Validation', () => {
        it('Should validate ClaimableInfo structure', () => {
            const claimable: ClaimableInfo = {
                amount: 1000000,
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                isExpired: false
            };

            expect(claimable.amount).to.be.a('number');
            expect(claimable.expiresAt).to.be.a('number');
            expect(claimable.isExpired).to.be.a('boolean');
        });

        it('Should validate DelegationInfo structure', () => {
            const delegation: DelegationInfo = {
                delegator: Keypair.generate().publicKey,
                delegate: Keypair.generate().publicKey
            };

            expect(delegation.delegator).to.be.instanceOf(PublicKey);
            expect(delegation.delegate).to.be.instanceOf(PublicKey);

            // Test with null delegate
            const nullDelegation: DelegationInfo = {
                delegator: Keypair.generate().publicKey,
                delegate: null
            };

            expect(nullDelegation.delegator).to.be.instanceOf(PublicKey);
            expect(nullDelegation.delegate).to.be.null;
        });

        it('Should validate DeploymentConfig structure', () => {
            const config: DeploymentConfig = {
                network: 'devnet',
                cluster: 'devnet',
                usdcMint: Keypair.generate().publicKey,
                mailService: Keypair.generate().publicKey,
                mailer: Keypair.generate().publicKey
            };

            expect(config.network).to.be.a('string');
            expect(config.cluster).to.be.a('string');
            expect(config.usdcMint).to.be.instanceOf(PublicKey);
            expect(config.mailService).to.be.instanceOf(PublicKey);
            expect(config.mailer).to.be.instanceOf(PublicKey);
        });

        it('Should validate MailServiceFees structure', () => {
            const fees: MailServiceFees = {
                delegationFee: 10000000
            };

            expect(fees.delegationFee).to.be.a('number');
        });

        it('Should validate MailerFees structure', () => {
            const fees: MailerFees = {
                sendFee: 100000
            };

            expect(fees.sendFee).to.be.a('number');
        });
    });

    describe('Utility Function Error Handling', () => {
        it('Should handle invalid inputs in formatUSDC', () => {
            // Should handle negative numbers
            expect(formatUSDC(-1000000)).to.equal('-1.00');
            
            // Should handle very large numbers
            const largeNumber = 999999999999999;
            const formatted = formatUSDC(largeNumber);
            expect(formatted).to.be.a('string');
            expect(formatted).to.include('.');
        });

        it('Should handle invalid inputs in parseUSDC', () => {
            // Should handle empty string (parseFloat('') returns NaN)
            expect(isNaN(parseUSDC(''))).to.be.true;
            
            // Should handle invalid numbers (parseFloat('abc') returns NaN, Math.floor(NaN) returns NaN)
            expect(isNaN(parseUSDC('abc'))).to.be.true;
            
            // Should handle negative numbers
            expect(parseUSDC('-1.50')).to.equal(-1500000);
        });

        it('Should handle precision limits', () => {
            // Test maximum precision (6 decimals for USDC)
            expect(parseUSDC('1.123456')).to.equal(1123456);
            
            // Test beyond maximum precision (should truncate)
            expect(parseUSDC('1.1234567')).to.equal(1123456);
            
            // Test formatting of very precise amounts
            expect(formatUSDC(1123456)).to.equal('1.12');
        });
    });

    describe('Type Safety', () => {
        it('Should ensure PublicKey types are properly typed', () => {
            const key = Keypair.generate().publicKey;
            
            // These should compile without TypeScript errors
            const delegation: DelegationInfo = {
                delegator: key,
                delegate: key
            };

            const config: DeploymentConfig = {
                network: 'testnet',
                cluster: 'testnet',
                usdcMint: key,
                mailService: key,
                mailer: key
            };

            expect(delegation.delegator).to.be.instanceOf(PublicKey);
            expect(config.usdcMint).to.be.instanceOf(PublicKey);
        });

        it('Should handle optional properties correctly', () => {
            // Test optional delegate in DelegationInfo
            const delegationWithNull: DelegationInfo = {
                delegator: Keypair.generate().publicKey,
                delegate: null
            };

            const delegationWithValue: DelegationInfo = {
                delegator: Keypair.generate().publicKey,
                delegate: Keypair.generate().publicKey
            };

            expect(delegationWithNull.delegate).to.be.null;
            expect(delegationWithValue.delegate).to.be.instanceOf(PublicKey);
        });

        it('Should enforce number types for fee structures', () => {
            // These should be numbers, not strings
            const mailServiceFees: MailServiceFees = {
                delegationFee: 10000000
            };

            const mailerFees: MailerFees = {
                sendFee: 100000
            };

            expect(typeof mailServiceFees.delegationFee).to.equal('number');
            expect(typeof mailerFees.sendFee).to.equal('number');
        });
    });

    describe('Network Configuration Validation', () => {
        it('Should have valid PublicKey strings in network configs', () => {
            Object.entries(NETWORK_CONFIGS).forEach(([network, config]) => {
                expect(network).to.be.a('string');
                expect(config.usdcMint).to.be.instanceOf(PublicKey);
                
                // Verify PublicKey is valid (58 character base58 string)
                const keyString = config.usdcMint.toString();
                expect(keyString).to.have.length.greaterThan(40);
                expect(keyString).to.have.length.lessThan(50);
            });
        });

        it('Should have consistent network configurations', () => {
            // Devnet and testnet should use the same USDC mint
            expect(NETWORK_CONFIGS['devnet'].usdcMint.toString())
                .to.equal(NETWORK_CONFIGS['testnet'].usdcMint.toString());
            
            // Mainnet should use different mint
            expect(NETWORK_CONFIGS['mainnet-beta'].usdcMint.toString())
                .to.not.equal(NETWORK_CONFIGS['devnet'].usdcMint.toString());
        });

        it('Should support common network names', () => {
            const requiredNetworks = ['mainnet-beta', 'devnet', 'testnet'];
            
            requiredNetworks.forEach(network => {
                expect(NETWORK_CONFIGS[network]).to.be.an('object');
                expect(NETWORK_CONFIGS[network].usdcMint).to.be.instanceOf(PublicKey);
            });
        });
    });
});