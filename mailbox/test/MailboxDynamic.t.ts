import { expect } from "chai";
import { ethers } from "hardhat";
import { Interface } from "ethers";

describe("MailboxDynamic", () => {
  it("sendJson: emits MessageJSON with arbitrary JSON (nested, unicode)", async () => {
    const [a, b] = await ethers.getSigners();

    const F = await ethers.getContractFactory("MailboxDynamic");
    const c = await F.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();

    const schema = "InsurancePolicy:v1";
    const payload = {
      policyNumber: "POL-2025-001",
      holderName: "Jånë Dœ 👋",
      yearsCovered: 3,
      accidentFree: true,
      nested: { vehicle: { make: "Honda", model: "Civic", year: 2020 } },
      array: [1, 2, 3],
    };
    const json = JSON.stringify(payload);

    await expect(c.connect(a).sendJson(b.address, schema, json))
      .to.emit(c, "MessageJSON")
      .withArgs(await a.getAddress(), b.address, schema, json);

    const tx = await c.connect(a).sendJson(b.address, schema, json);
    const rc = await tx.wait();
    expect(rc?.status).to.eq(1);

    const ifaceJSON = new Interface([
      "event MessageJSON(address indexed from, address indexed to, string schema, string json)",
    ]);
    const log = rc!.logs.find((l) => l.address.toLowerCase() === addr.toLowerCase());
    expect(log, "MessageJSON log not found").to.exist;

    const decoded = ifaceJSON.decodeEventLog("MessageJSON", log!.data, log!.topics);
    expect((decoded[0] as string).toLowerCase()).to.eq((await a.getAddress()).toLowerCase());
    expect((decoded[1] as string).toLowerCase()).to.eq(b.address.toLowerCase());
    expect(decoded[2]).to.eq(schema);
    expect(decoded[3]).to.eq(json);
  });

  it("sendKV: emits MessageKV with dynamic fieldKeys/fieldValues (pretty, typed arrays)", async () => {
    const [a, b] = await ethers.getSigners();

    const F = await ethers.getContractFactory("MailboxDynamic");
    const c = await F.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();

    const schema = "InsurancePolicy:v1";
    const fieldKeys   = ["policyNumber", "holderName", "yearsCovered", "accidentFree", "note"];
    const fieldValues = ["POL-2025-002", "John Doe", "5", "false", "edge: äöü ✅"];

    await expect(c.connect(a).sendKV(b.address, schema, fieldKeys, fieldValues))
      .to.emit(c, "MessageKV")
      .withArgs(await a.getAddress(), b.address, schema, fieldKeys, fieldValues);

    const tx = await c.connect(a).sendKV(b.address, schema, fieldKeys, fieldValues);
    const rc = await tx.wait();
    expect(rc?.status).to.eq(1);

    const ifaceKV = new Interface([
      "event MessageKV(address indexed from, address indexed to, string schema, string[] fieldKeys, string[] fieldValues)",
    ]);
    const log = rc!.logs.find((l) => l.address.toLowerCase() === addr.toLowerCase());
    expect(log, "MessageKV log not found").to.exist;

    const dec = ifaceKV.decodeEventLog("MessageKV", log!.data, log!.topics);
    expect((dec[0] as string).toLowerCase()).to.eq((await a.getAddress()).toLowerCase());
    expect((dec[1] as string).toLowerCase()).to.eq(b.address.toLowerCase());
    expect(dec[2]).to.eq(schema);
    expect(dec[3]).to.deep.eq(fieldKeys);
    expect(dec[4]).to.deep.eq(fieldValues);
  });

  it("sendKV: reverts on fieldKeys/fieldValues length mismatch", async () => {
    const [a, b] = await ethers.getSigners();

    const F = await ethers.getContractFactory("MailboxDynamic");
    const c = await F.deploy();
    await c.waitForDeployment();

    const schema = "";
    const fieldKeys   = ["a", "b", "c"];
    const fieldValues = ["1", "2"];

    await expect(
      c.connect(a).sendKV(b.address, schema, fieldKeys, fieldValues)
    ).to.be.revertedWith("keys/values length mismatch");
  });
});
