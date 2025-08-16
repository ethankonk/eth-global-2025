import { ethers } from 'hardhat';

async function main() {
  const F = await ethers.getContractFactory('MailboxDynamic');
  const c = await F.deploy();
  await c.waitForDeployment();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
