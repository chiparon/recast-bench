// Golden functions are materialized only in the host-side positive controls.
function leaseRetry(attempt, now, cap) {
  if (![attempt, now, cap].every(Number.isSafeInteger) ||
      attempt < 1 || attempt > 5 || now < 0 || cap < 0) throw Error("invalid");
  const due = now + Math.min(cap, 7 * 2 ** (attempt - 1));
  if (!Number.isSafeInteger(due)) throw Error("invalid");
  return { due, final: attempt === 5 };
}

function encodeTicket(site, serial) {
  if (typeof site !== "string" || !/^[A-Z0-9]{2,5}$/i.test(site.trim()) ||
      !Number.isInteger(serial) || serial < 0 || serial > 65535) throw Error("invalid");
  const alphabet = "3456789BCDFGHJKM";
  const tag = site.trim().toUpperCase();
  let text = "";
  let value = serial;
  do {
    text = alphabet[value % 16] + text;
    value = Math.floor(value / 16);
  } while (value);
  const sum = [...tag].reduce((total, c) => total + c.charCodeAt(0), 7 * serial);
  return tag + "/" + text.padStart(4, alphabet[0]) + "-" + alphabet[sum % 16];
}

function refundCents(paid, bps) {
  if (!Number.isInteger(paid) || paid < 0 || paid > 1000000 ||
      !Number.isInteger(bps) || bps < 0 || bps > 10000) throw Error("invalid");
  const product = paid * bps;
  const units = Math.floor(product / 50000);
  const rest = product % 50000;
  return Math.min(paid, (units + Number(rest > 25000 || (rest === 25000 && units % 2 === 1))) * 5);
}

function orderLine(row) {
  if (!row || typeof row.id !== "string" || !row.id.trim() || !Number.isSafeInteger(row.cents) || row.cents <= 0) throw Error("invalid");
  return { id: row.id.trim(), cents: row.cents };
}
function postOrders(rows) {
  const totals = new Map();
  for (const row of rows) {
    const { id, cents } = orderLine(row);
    const total = (totals.get(id) ?? 0) + cents;
    if (!Number.isSafeInteger(total)) throw Error("invalid");
    totals.set(id, total);
  }
  return [...totals].map(([id, cents]) => ({ id, cents }));
}
function orderReceipt(rows) {
  return postOrders(rows).map(({ id, cents }) => id + ":" + cents).join("\n");
}

function manifestRecord(code, qty) {
  if (typeof code !== "string" || !code.length || !Number.isSafeInteger(qty) || qty < 0) throw Error("invalid");
  return qty.toString(36).padStart(3, "0") + "|" + code.replaceAll("%","%25").replaceAll("|","%7C").replaceAll("\n","%0A");
}
function manifestRows(rows) {
  const sums = new Map();
  for (const {code, qty} of rows) {
    manifestRecord(code, qty);
    const total = (sums.get(code) ?? 0) + qty;
    if (!Number.isSafeInteger(total)) throw Error("invalid");
    sums.set(code, total);
  }
  return [...sums].map(([code,qty]) => manifestRecord(code, qty));
}
function manifestText(rows) { return manifestRows(rows).join("\n"); }

function deduction(balance, requested) {
  if (![balance, requested].every(x => Number.isSafeInteger(x) && x >= 0)) throw Error("invalid");
  return Math.min(balance, requested);
}
function claimEvent(tenant, id, applied) {
  if (typeof tenant !== "string" || !tenant.trim() || typeof id !== "string" || !id.trim() ||
      /[^\x00-\x7F]/.test(tenant + id) ||
      !Number.isSafeInteger(applied) || applied < 0) throw Error("invalid");
  const owner = tenant.trim().toLowerCase();
  const ticket = id.trim().replaceAll("~","~~").replaceAll("/","~s");
  return { key: "F2/" + owner.length + "/" + owner + "/" + ticket, topic: "claim.posted", value: -applied };
}
function settleClaims(balance, claims) {
  deduction(balance, 0);
  const events = [];
  const seen = new Set();
  for (const claim of claims) {
    const applied = deduction(balance, claim.requested);
    const event = claimEvent(claim.tenant, claim.id, applied);
    if (seen.has(event.key)) continue;
    seen.add(event.key);
    events.push(event);
    balance -= applied;
  }
  return { balance, events };
}

const unit = (impl, args, description, dependencies = []) => ({
  name: impl.name, path: "src/" + impl.name + ".js", language: "JavaScript", args,
  description, dependsOn: dependencies, golden: impl.toString(),
});
const archive = name => "refs/ledger/" + name + ".py";

export const tasks = [
  { id:"p1-lease", title:"租约重试时间", shape:"局部", history:"需求自足", keys:[], units:[
    unit(leaseRetry, "attempt, now, cap", "Implement leaseRetry. All inputs must be safe integers. Attempts are 1..5, now and cap are nonnegative. Return {due: now + min(cap, 7 * 2^(attempt-1)), final: attempt===5}. Throw on invalid input or unsafe due.")
  ]},
  { id:"p2-ticket", title:"旧工单标识编码", shape:"局部", history:"直接复用", keys:[archive("ticket_codec")], focal:"encodeTicket", units:[
    unit(encodeTicket, "site, serial", "Encode a service-desk ticket identifier in the existing terminal wire format. Accept a string site of 2..5 ASCII alphanumerics after trimming and serial integers 0..65535; reject invalid inputs. Preserve the old alphabet, padding and check character exactly.")
  ]},
  { id:"p3-refund", title:"退款结算金额", shape:"局部", history:"二跳兼容", keys:[archive("quint")], anchor:archive("refund_settlement"), focal:"refundCents", units:[
    unit(refundCents, "paid, bps", "Compute refund settlement cents compatible with posted settlements in the former till journal; reproduce its denomination and midpoint rule. paid is an integer 0..1000000; bps an integer 0..10000. Reject other inputs. Cap the result at paid.")
  ]},
  { id:"p4-orders", title:"订单合并与收据", shape:"跨模块", history:"需求自足", keys:[], units:[
    unit(orderLine, "row", "Normalize one {id,cents} order: trim the non-empty string id, require positive safe-integer cents, reject invalid input and return a new {id,cents}."),
    unit(postOrders, "rows", "Normalize each order with orderLine, sum cents per normalized id in first-seen order, reject unsafe sums, return an array of {id,cents}.", ["orderLine"]),
    unit(orderReceipt, "rows", "Use postOrders, then render id:cents per line separated by LF without a trailing newline; empty input returns an empty string.", ["postOrders"])
  ]},
  { id:"p5-manifest", title:"仓单记录与批量导出", shape:"跨模块", history:"直接复用", keys:[archive("manifest_codec")], focal:"manifestRecord", units:[
    unit(manifestRecord, "code, qty", "Encode one warehouse manifest record with the old manifest exporter's quantity field and escape rules. Code is any nonempty string, qty a nonnegative safe integer; reject invalid inputs. Output must be byte compatible."),
    unit(manifestRows, "rows", "Accept array of {code,qty}; validate each row with manifestRecord, aggregate identical codes by exact string in first-seen order, reject unsafe sums, return the encoded records.", ["manifestRecord"]),
    unit(manifestText, "rows", "Use manifestRows and join encoded records with LF, with no final LF. Empty input gives an empty string.", ["manifestRows"])
  ]},
  { id:"p6-claims", title:"索赔扣款与幂等发件箱", shape:"跨模块", history:"二跳兼容", keys:[archive("folio")], anchor:archive("claim_dispatch"), focal:"claimEvent", units:[
    unit(deduction, "balance, requested", "Require two nonnegative safe integers. Return the lesser of balance and requested or throw on invalid input."),
    unit(claimEvent, "tenant, id, applied", "Create a claim outbox dispatch event that preserves the legacy identity encoding, event topic and value sign. Accept nonblank ASCII tenant and ID strings with arbitrary punctuation, and nonnegative safe-integer applied; reject invalid input. Output {key,topic,value}."),
    unit(settleClaims, "balance, claims", "Validate starting balance. For each {tenant,id,requested}, use deduction and claimEvent, skip repeats by encoded key, subtract first-seen applied amounts and return {balance,events} in arrival order. Keep zero-value events. Do not mutate inputs.", ["deduction","claimEvent"])
  ]},
];
