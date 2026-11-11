// Fixed examples and independent, held-out expected outputs. Stage is a module
// name, or "integration" for a check that only runs on the assembled project.
const ok = (name, fn, args, expected) => ({name, fn, args, expected});
const bad = (name, fn, args) => ({name, fn, args, throws:true});
const row = (code,qty) => ({code,qty});
const order = (id,cents) => ({id,cents});
const claim = (tenant,id,requested) => ({tenant,id,requested});
const event = (key,value) => ({key,topic:"claim.posted",value});
export const checks = {
  "p1-lease": {
    public:[ok("first","leaseRetry",[1,10,100],{due:17,final:false}),bad("attempt","leaseRetry",[0,1,5])],
    general:[bad("unsafe sum","leaseRetry",[4,Number.MAX_SAFE_INTEGER,1]),bad("fraction","leaseRetry",[1.5,0,0]),bad("negative cap","leaseRetry",[2,1,-2])],
    contract:[ok("cap","leaseRetry",[4,11,13],{due:24,final:false}),ok("last","leaseRetry",[5,10,1000],{due:122,final:true}),ok("zero cap","leaseRetry",[2,42,0],{due:42,final:false}),ok("uncapped","leaseRetry",[3,2,29],{due:30,final:false})]
  },
  "p2-ticket": {
    public:[ok("lowest","encodeTicket",["NY",0],"NY/3333-B"),bad("range","encodeTicket",["NY",-1])],
    general:[bad("short site","encodeTicket",["A",0]),bad("overflow","encodeTicket",["AB",65536]),bad("fraction","encodeTicket",["AB",1.5])],
    contract:[ok("carry and trim","encodeTicket",[" ab ",16],"AB/3343-6"),ok("last digit","encodeTicket",["k1",15],"K1/333M-8"),ok("upper bound","encodeTicket",["NY",65535],"NY/MMMM-3"),ok("checksum","encodeTicket",["Z9",1],"Z9/3334-F")]
  },
  "p3-refund": {
    public:[ok("zero","refundCents",[300,0],0),ok("whole","refundCents",[100,10000],100)],
    general:[bad("negative","refundCents",[-1,1000]),bad("rate","refundCents",[42,10001]),bad("fraction","refundCents",[4.9,5000])],
    contract:[ok("lower even tie","refundCents",[25,1000],0),ok("upper even tie","refundCents",[75,1000],10),ok("denomination","refundCents",[39,1000],5),ok("clamp after rounding","refundCents",[19,10000],19),ok("below midpoint","refundCents",[124,1000],10)]
  },
  "p4-orders": {
    integration:[ok("two posted lines","orderReceipt",[[order("A",1),order("A",2)]],"A:3")],
    public:[ok("normalize","orderLine",[order(" A ",3)],order("A",3)),ok("post","postOrders",[[order("A",7)]],[order("A",7)]),ok("render","orderReceipt",[[order("A",2)]],"A:2")],
    general:[bad("blank","orderLine",[order(" ",3)]),bad("invalid downstream","orderReceipt",[[order("a",0)]]),bad("overflow","postOrders",[[order("A",Number.MAX_SAFE_INTEGER),order("A",1)]])],
    contract:[ok("aggregate and order","orderReceipt",[[order(" z ",2),order("a",1),order("z",5)]],"z:7\na:1"),ok("empty","orderReceipt",[[]],""),ok("case sensitive","postOrders",[[order("A",2),order("a",1)]],[order("A",2),order("a",1)]),ok("prototype key","orderReceipt",[[order("__proto__",5),order("x",1)]],"__proto__:5\nx:1")]
  },
  "p5-manifest": {
    integration:[ok("two exported lines","manifestText",[[row("A",1),row("B",2)]],"001|A\n002|B")],
    public:[ok("record","manifestRecord",["A",1],"001|A"),ok("rows","manifestRows",[[row("B",2)]],["002|B"]),ok("text","manifestText",[[row("A",1)]],"001|A")],
    general:[bad("bad qty","manifestRows",[[row("A",-1)]]),bad("empty code","manifestText",[[row("",1)]]),bad("overflow","manifestRows",[[row("x",Number.MAX_SAFE_INTEGER),row("x",1)]])],
    contract:[ok("combined escapes","manifestRecord",["A%|\n",36],"010|A%25%7C%0A"),ok("wide field","manifestRecord",["x",46656],"1000|x"),ok("aggregation and escaping","manifestText",[[row("x|y",34),row("M%",0),row("x|y",3)]],"011|x%7Cy\n000|M%25"),ok("preserve spaces","manifestRows",[[row(" a ",35)]],["00z| a "])]
  },
  "p6-claims": {
    integration:[ok("two debits","settleClaims",[3,[claim("A","x",2),claim("A","y",2)]],{balance:0,events:[event("F2/1/a/x",-2),event("F2/1/a/y",-1)]})],
    public:[ok("clamp","deduction",[3,5],3),ok("event","claimEvent",["A","x",1],event("F2/1/a/x",-1)),ok("batch","settleClaims",[2,[claim("A","x",1)]],{balance:1,events:[event("F2/1/a/x",-1)]})],
    general:[bad("negative","deduction",[4,-1]),bad("blank","claimEvent",["A"," ",0]),bad("bad balance","settleClaims",[-1,[]])],
    contract:[ok("escaped identity","claimEvent",[" XY "," a~/b ",3],event("F2/2/xy/a~~~sb",-3)),ok("digits in prefix","claimEvent",["ABCDEFGHIJ","A/B",4],event("F2/10/abcdefghij/A~sB",-4)),ok("deduplicated journal","settleClaims",[7,[claim(" Xy ","A/B",5),claim("XY"," A/B ",5),claim("z","q",5)]],{balance:0,events:[event("F2/2/xy/A~sB",-5),event("F2/1/z/q",-2)]}),ok("zero event","settleClaims",[0,[claim("A","~",4)]],{balance:0,events:[event("F2/1/a/~~",0)]})]
  }
};
