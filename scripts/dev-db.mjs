// Starts a throwaway MongoDB on 127.0.0.1:27027 filled with sample KeyStone data, for
// trying the portal without touching the real database. Data is gone when you stop it.
//   npm run dev:db
// Money is stored as strings and dates as UTC - the same shapes the desktop app writes.
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";

const server = await MongoMemoryServer.create({ instance: { port: 27027, ip: "127.0.0.1" } });
const client = new MongoClient(server.getUri());
await client.connect();
const db = client.db("keystone-db");

const day = (offsetDays) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays) - 4 * 3600e3);
};
// 1x1 orange PNG, so attachments have something to show.
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const adminId = new ObjectId();
const userId = new ObjectId();
const user2Id = new ObjectId();
const empId = new ObjectId();
const emp2Id = new ObjectId();
const villaId = new ObjectId();
const campId = new ObjectId();

await db.collection("employees").insertMany([
  { _id: empId, name: "Ahmed Al Balushi", designation: "Site Engineer", phone: "", monthlySalary: "650", joiningDate: day(-400), status: "Permanent", disabledAt: null, salaryPayments: [], createdAt: day(-400), projectAllocations: [] },
  { _id: emp2Id, name: "Fatima Al Hinai", designation: "Accountant", phone: "", monthlySalary: "700", joiningDate: day(-300), status: "Permanent", disabledAt: null, salaryPayments: [], createdAt: day(-300), projectAllocations: [] },
]);

await db.collection("users").insertMany([
  { _id: adminId, fullName: "Sara Admin", email: "admin@keystoneinvestmentllc.com", passwordHash: "x", role: "Admin", employeeId: null, employeeName: "", creditGrants: [] },
  { _id: userId, fullName: "Ahmed Al Balushi", email: "ahmed@keystoneinvestmentllc.com", passwordHash: "x", role: "User", employeeId: empId.toHexString(), employeeName: "Ahmed Al Balushi", creditGrants: [{ amount: "500", note: "Site petty cash", grantedAt: day(-40), grantedBy: "Sara Admin" }] },
  { _id: user2Id, fullName: "Old Gmail Account", email: "someone@gmail.com", passwordHash: "x", role: "User", employeeId: null, employeeName: "", creditGrants: [] },
]);

await db.collection("projects").insertMany([
  {
    _id: villaId, clientName: "Al Saadi Family", name: "Ten Residential Villas, Saham", description: "Ten two-storey villas including MEP.", contractValue: "420000", natureOfProject: "Residential",
    status: "Processing", createdAt: day(-200), invoiceHistory: [], subcontractorAgreements: [],
    clauses: [
      { title: "Mobilisation", paymentType: "Percentage", percentage: "10", paymentAmount: "40000", status: "Paid", amountPaid: "0", closedAt: day(-150), payments: [{ amount: "40000", paidAt: day(-150), note: "", recordedBy: "Sara Admin" }] },
      { title: "Structure", paymentType: "Percentage", percentage: "40", paymentAmount: "160000", status: "Partially Paid", amountPaid: "0", closedAt: day(-20), payments: [{ amount: "60000", paidAt: day(-80), note: "", recordedBy: "Sara Admin" }, { amount: "45000", paidAt: day(-20), note: "", recordedBy: "Sara Admin" }] },
      { title: "Finishing", paymentType: "Percentage", percentage: "50", paymentAmount: "200000", status: "Pending", amountPaid: "0", closedAt: new Date(-62135596800000), payments: [] },
    ],
    expenses: [
      { type: "Materials Payment", title: "Cement and steel", amount: "38500", transactionDate: day(-120), sourceClaimId: null, sourceSubcontractorClauseId: null, includesVat: false, taxPercent: "5", invoiceImageBase64: null, attachments: [{ fileName: "invoice.png", contentType: "image/png", base64: png }], addedByUserName: "Sara Admin" },
      { type: "Daily Labour Payment", title: "Labour - month 3", amount: "12400", transactionDate: day(-60), sourceClaimId: null, sourceSubcontractorClauseId: null, includesVat: true, taxPercent: "5", invoiceImageBase64: null, attachments: [], addedByUserName: "Sara Admin" },
      { type: "Transporting", title: "Crane hire", amount: "3200", transactionDate: day(-15), sourceClaimId: null, sourceSubcontractorClauseId: null, includesVat: false, taxPercent: "0", invoiceImageBase64: null, attachments: [], addedByUserName: "Sara Admin" },
    ],
  },
  {
    _id: campId, clientName: "Sohar Port Services", name: "Labour Camp, Sohar", description: "", contractValue: "185000", natureOfProject: "Infrastructure",
    status: "Pending", createdAt: day(-30), invoiceHistory: [], subcontractorAgreements: [], clauses: [], expenses: [],
  },
]);

await db.collection("generalExpenses").insertMany([
  { title: "Office rent", type: "Overheads", amount: "850", transactionDate: day(-25), sourceClaimId: null, includesVat: false, taxPercent: "5", invoiceImageBase64: null, attachments: [], addedByUserName: "Sara Admin" },
  { title: "Pickup service", type: "Repair Vehicle", amount: "140", transactionDate: day(-50), sourceClaimId: null, includesVat: true, taxPercent: "5", invoiceImageBase64: null, attachments: [], addedByUserName: "Sara Admin" },
]);

const claim = (o) => ({ userId: userId.toHexString(), userName: "Ahmed Al Balushi", claimType: "General", projectId: null, projectName: "", expenseType: "User Claim", description: "", claimDate: day(-3), status: "Pending", createdAt: day(-3), decidedAt: null, proofImageBase64: null, attachments: [], includesVat: false, taxPercent: "5", fundedByCredit: false, ...o });
await db.collection("claims").insertMany([
  claim({ title: "Fuel for site pickup", expenseType: "Petrol", amount: "35.5", claimType: "Project", projectId: villaId.toHexString(), projectName: "Ten Residential Villas, Saham", attachments: [{ fileName: "receipt.png", contentType: "image/png", base64: png }] }),
  claim({ title: "Safety helmets", expenseType: "Materials Payment", amount: "120", fundedByCredit: true, claimDate: day(-6), createdAt: day(-6) }),
  claim({ title: "Visa medical fees", amount: "60", status: "Approved", decidedAt: day(-10), claimDate: day(-12), createdAt: day(-12), fundedByCredit: true }),
  claim({ title: "Taxi to client office", expenseType: "Transporting", amount: "8", status: "Rejected", decidedAt: day(-18), claimDate: day(-20), createdAt: day(-20) }),
]);

console.log(`\nTest database ready at mongodb://127.0.0.1:27027 (database keystone-db)`);
console.log("Sign in as:  admin@keystoneinvestmentllc.com  (Admin)   or   ahmed@keystoneinvestmentllc.com  (User)");
console.log("Press Ctrl+C to stop.\n");

const stop = async () => { await client.close(); await server.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
