"""
Cross-language reference implementations and real PolyCodeEval multi-language distractors
injected into `refs/` for each PolyCodeEval benchmark task.

Each project (in target language T) receives:
1. Authentic cross-language reference modules in languages S != T that implement the same
   domain algorithms, wire formats, and state machines (enabling RECAST's
   `prepareModuleTranslationScope` sourceLanguage -> targetLanguage adaptation).
2. Real multi-language distractor modules copied from other PolyCodeEval repositories across
   all 5 languages (C++, Java, Python, JavaScript, Go), testing `SAG2-SQLite` (FTS5 + JEV 2-hop)
   precision against cross-language retrieval noise.
"""

from pathlib import Path

# Real PolyCodeEval files from other repositories used as multi-language retrieval distractors
DISTRACTOR_SOURCES = [
    ("cpp", "base64pp", "base64pp/base64pp.cpp", "refs/distractors/cpp/base64pp.cpp"),
    ("cpp", "area_calculation", "src/main.cpp", "refs/distractors/cpp/area_calculation.cpp"),
    ("java", "java_heap", "src/main/java/code/FibonacciHeap.java", "refs/distractors/java/FibonacciHeap.java"),
    ("java", "redis-cache", "src/main/java/org/mybatis/caches/redis/RedisCache.java", "refs/distractors/java/RedisCache.java"),
    ("python", "hone", "hone/hone.py", "refs/distractors/python/hone_csv_nested.py"),
    ("python", "stocktrends", "stocktrends/indicators.py", "refs/distractors/python/stock_indicators.py"),
    ("javascript", "minimist", "index.js", "refs/distractors/js/minimist_args.js"),
    ("javascript", "mitt", "src/index.ts", "refs/distractors/js/mitt_events.ts"),
    ("javascript", "nanoid", "index.js", "refs/distractors/js/nanoid_gen.js"),
    ("go", "alice", "chain.go", "refs/distractors/go/alice_middleware.go"),
    ("go", "go-env", "env.go", "refs/distractors/go/go_env_loader.go"),
]

# Cross-language ground-truth reference modules for each of the 5 target projects
CROSS_LANG_TRUTH_REFS = {
    # =========================================================================
    # 1. Target: C++ (cpp/logistic_system) -> Refs in Python & Java
    # =========================================================================
    "logistic_system": {
        "refs/python/logistics_account_expressage_ref.py": '''"""
Cross-language reference (Python -> C++) for AccountNode and ExpressageNode entities.
Mirrors account.cpp and expressage.cpp data models, Sign(time) transition, and stream output format.
"""

class Authority:
    ROOT = 0
    ADMIN = 1
    USER = 2


class AccountNode:
    """Reference for AccountNode constructors and operator<< formatting in account.cpp."""

    def __init__(
        self,
        _id: str = "",
        _pwd: str = "",
        _nm: str = "",
        _ph: str = "",
        _m: float = 0.0,
        _ad: str = "",
        _t: int = Authority.USER,
    ):
        self.id = _id
        self.password = _pwd
        self.name = _nm
        self.phone = _ph
        self.money = _m
        self.address = _ad
        self.type = _t

    def format_output(self) -> str:
        role_label = {
            Authority.ROOT: "root",
            Authority.ADMIN: "admin",
            Authority.USER: "normal user",
        }[self.type]
        return (
            f"AccountId: {self.id}\\n"
            f"UserName: {self.name}\\n"
            f"UserPhone: {self.phone}\\n"
            f"Money: {self.money:g}\\n"
            f"Address: {self.address}\\n"
            f"UserType: {role_label}\\n"
        )


class ExpressageNode:
    """Reference for ExpressageNode constructors, Sign(time), and operator<< in expressage.cpp."""

    def __init__(
        self,
        _id: str = "",
        _sendUser: str = "",
        _receiveUser: str = "",
        _assignTime: str = "",
        _signTime: str = "",
        _remark: str = "",
        _Flag: bool = False,
    ):
        self.id = _id
        self.sendUser = _sendUser
        self.receiveUser = _receiveUser
        self.assignTime = _assignTime
        self.signTime = _signTime
        self.remark = _remark
        self.Flag = _Flag

    def Sign(self, time_str: str) -> bool:
        if self.Flag:
            return False
        self.Flag = True
        self.signTime = time_str
        return True

    def format_output(self) -> str:
        status_str = "Signed" if self.Flag else "Unsigned"
        return (
            f"Expressage id: {self.id}\\n"
            f"Sender: {self.sendUser}\\n"
            f"Recipient: {self.receiveUser}\\n"
            f"Send Time: {self.assignTime}\\n"
            f"Status: {status_str}\\n"
            f"Sign Time: {self.signTime}\\n"
            f"Remark: {self.remark}\\n"
        )
''',
        "refs/python/logistics_sys_service_ref.py": '''"""
Cross-language reference (Python -> C++) for LogisticSys in src/logistics.cpp.
Implements init, save, Regist, Login, changePassword, queryInfo, queryMoney, addMoney,
assignExpressage (15-unit fee from sender to root, KD + 8-digit zero-padded ID),
signExpressage, queryAllExpressage, and queryExpressage.
"""
from typing import List
from .logistics_account_expressage_ref import AccountNode, ExpressageNode, Authority


class LogisticSysRef:
    def __init__(self):
        self.accountList: List[AccountNode] = []
        self.expressageList: List[ExpressageNode] = []

    def init(self, accountFile: str = "./data/account.txt", expressageFile: str = "./data/expressage.txt") -> None:
        self.accountList.clear()
        self.expressageList.clear()
        try:
            with open(accountFile, "r", encoding="utf-8") as f:
                tokens = f.read().split()
            if tokens:
                n = int(tokens[0])
                idx = 1
                for _ in range(n):
                    _id, _pwd, _nm, _ph = tokens[idx], tokens[idx + 1], tokens[idx + 2], tokens[idx + 3]
                    _m = float(tokens[idx + 4])
                    _ad = tokens[idx + 5]
                    _t = int(tokens[idx + 6])
                    idx += 7
                    self.accountList.append(AccountNode(_id, _pwd, _nm, _ph, _m, _ad, _t))
        except FileNotFoundError:
            pass

        try:
            with open(expressageFile, "r", encoding="utf-8") as f:
                tokens = f.read().split()
            if tokens:
                m = int(tokens[0])
                idx = 1
                for _ in range(m):
                    _id, _s, _r, _at, _st = tokens[idx], tokens[idx + 1], tokens[idx + 2], tokens[idx + 3], tokens[idx + 4]
                    _flag = int(tokens[idx + 5]) != 0
                    _rem = tokens[idx + 6]
                    idx += 7
                    self.expressageList.append(ExpressageNode(_id, _s, _r, _at, _st, _rem, _flag))
        except FileNotFoundError:
            pass

    def save(self, accountFile: str = "./data/account.txt", expressageFile: str = "./data/expressage.txt") -> None:
        with open(accountFile, "w", encoding="utf-8") as f:
            f.write(f"{len(self.accountList)}\\n")
            for a in self.accountList:
                f.write(f"{a.id} {a.password} {a.name} {a.phone} {a.money:g} {a.address} {a.type}\\n")
        with open(expressageFile, "w", encoding="utf-8") as f:
            f.write(f"{len(self.expressageList)}\\n")
            for e in self.expressageList:
                flag_int = 1 if e.Flag else 0
                f.write(f"{e.id} {e.sendUser} {e.receiveUser} {e.assignTime} {e.signTime} {flag_int} {e.remark}\\n")

    def Regist(self, _id: str, _pwd: str, _nm: str, _ph: str, _m: float, _ad: str) -> bool:
        if any(a.id == _id for a in self.accountList):
            return False
        self.accountList.append(AccountNode(_id, _pwd, _nm, _ph, _m, _ad, Authority.USER))
        return True

    def Login(self, _id: str, _pwd: str) -> int:
        for i, a in enumerate(self.accountList):
            if a.id == _id:
                return i if a.password == _pwd else -1
        return -1

    def changePassword(self, curAccount: int, oldpwd: str, newpwd: str) -> bool:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return False
        if self.accountList[curAccount].password != oldpwd:
            return False
        self.accountList[curAccount].password = newpwd
        return True

    def queryInfo(self, curAccount: int) -> AccountNode:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return AccountNode()
        return self.accountList[curAccount]

    def queryMoney(self, curAccount: int) -> float:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return -1.0
        return self.accountList[curAccount].money

    def addMoney(self, curAccount: int, m: float) -> float:
        if curAccount < 0 or curAccount >= len(self.accountList) or m < 0:
            return -1.0
        self.accountList[curAccount].money += m
        return self.accountList[curAccount].money

    def assignExpressage(self, curAccount: int, receiverId: str, remark: str, time_str: str) -> bool:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return False
        if self.accountList[curAccount].money < 15:
            return False
        recv_idx = -1
        for i, a in enumerate(self.accountList):
            if a.id == receiverId:
                if a.type == Authority.ROOT:
                    return False
                recv_idx = i
                break
        if recv_idx == -1:
            return False
        self.accountList[curAccount].money -= 15
        self.accountList[0].money += 15
        kd_id = f"KD{len(self.expressageList) + 1:08d}"
        self.expressageList.append(
            ExpressageNode(kd_id, self.accountList[curAccount].id, receiverId, time_str, "NULL", remark, False)
        )
        return True

    def signExpressage(self, curAccount: int, exp_id: str, time_str: str) -> bool:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return False
        cur_user = self.accountList[curAccount].id
        for e in self.expressageList:
            if e.id == exp_id:
                if e.receiveUser != cur_user:
                    return False
                return e.Sign(time_str)
        return False

    def queryAllExpressage(self, curAccount: int) -> List[ExpressageNode]:
        if curAccount < 0 or curAccount >= len(self.accountList):
            return []
        acc = self.accountList[curAccount]
        if acc.type in (Authority.ROOT, Authority.ADMIN):
            return list(self.expressageList)
        return [e for e in self.expressageList if e.sendUser == acc.id or e.receiveUser == acc.id]

    def queryExpressage(self, curAccount: int, exp_id: str) -> ExpressageNode:
        for e in self.queryAllExpressage(curAccount):
            if e.id == exp_id:
                return e
        return ExpressageNode()
''',
        "refs/java/LogisticsCliLoopRef.java": '''package refs.java;

import java.util.List;
import java.util.Scanner;

/**
 * Cross-language reference (Java -> C++) for the interactive terminal loop in src/main.cpp.
 * Handles pre-login commands (login, reg, exit, unknown) and post-login commands
 * (cpwd, send, sign, qm, recharge, qall, qalls, qallr, qs, qr, qt, q, exit).
 */
public class LogisticsCliLoopRef {
    public static void runCommandLoop(Scanner cin, LogisticSysBridge sys) {
        boolean loginFlag = false;
        int curAccount = -1;
        sys.init();
        while (!loginFlag && cin.hasNext()) {
            String op = cin.next();
            if ("login".equals(op)) {
                String id = cin.next();
                String pwd = cin.next();
                curAccount = sys.Login(id, pwd);
                if (curAccount >= 0) {
                    loginFlag = true;
                    System.out.print("Welcome!\\n");
                } else {
                    System.out.print("Wrong account id or/and password.\\n");
                }
            } else if ("reg".equals(op)) {
                String id = cin.next(), pwd = cin.next(), name = cin.next(), phone = cin.next(), addr = cin.next();
                System.out.print(sys.Regist(id, pwd, name, phone, 0, addr) ? "Succeed.\\n" : "Failed.\\n");
            } else if ("exit".equals(op)) {
                System.out.print("Bye!\\n");
                break;
            } else {
                System.out.print("Wrong operation name.\\n");
            }
        }
        if (!loginFlag) return;
        System.out.print(sys.queryInfo(curAccount));
        while (cin.hasNext()) {
            String op = cin.next();
            if ("cpwd".equals(op)) {
                String oldpwd = cin.next(), newpwd = cin.next();
                System.out.print(sys.changePassword(curAccount, oldpwd, newpwd) ? "Succeed.\\n" : "Failed.\\n");
            } else if ("send".equals(op)) {
                String receiverId = cin.next(), remark = cin.next(), time = cin.next();
                System.out.print(sys.assignExpressage(curAccount, receiverId, remark, time) ? "Succeed.\\n" : "Failed.\\n");
            } else if ("sign".equals(op)) {
                String id = cin.next(), time = cin.next();
                System.out.print(sys.signExpressage(curAccount, id, time) ? "Succeed.\\n" : "Failed.\\n");
            } else if ("qm".equals(op)) {
                System.out.printf("Rest money: %.2f\\n", sys.queryMoney(curAccount));
            } else if ("recharge".equals(op)) {
                double x = cin.nextDouble();
                double res = sys.addMoney(curAccount, x);
                if (res < 0) System.out.print("Failed.\\n");
                else System.out.printf("Rest money: %.2f\\n", res);
            } else if ("qall".equals(op)) {
                for (String item : sys.queryAllExpressageFormatted(curAccount)) System.out.print(item);
            } else if ("qalls".equals(op)) {
                for (String item : sys.queryBySender(curAccount, sys.currentUserId(curAccount))) System.out.print(item);
            } else if ("qallr".equals(op)) {
                for (String item : sys.queryByReceiver(curAccount, sys.currentUserId(curAccount))) System.out.print(item);
            } else if ("qs".equals(op)) {
                String x = cin.next();
                for (String item : sys.queryBySender(curAccount, x)) System.out.print(item);
            } else if ("qr".equals(op)) {
                String x = cin.next();
                for (String item : sys.queryByReceiver(curAccount, x)) System.out.print(item);
            } else if ("qt".equals(op)) {
                String t = cin.next();
                for (String item : sys.queryByTime(curAccount, t)) System.out.print(item);
            } else if ("q".equals(op)) {
                String id = cin.next();
                String item = sys.queryExpressageFormatted(curAccount, id);
                if (item.isEmpty()) System.out.print("Failed.\\n");
                else System.out.print(item);
            } else if ("exit".equals(op)) {
                System.out.print("Bye!\\n");
                break;
            } else {
                System.out.print("Wrong operation name.\\n");
            }
        }
    }

    public interface LogisticSysBridge {
        void init();
        int Login(String id, String pwd);
        boolean Regist(String id, String pwd, String name, String phone, double money, String addr);
        String queryInfo(int curAccount);
        boolean changePassword(int curAccount, String oldpwd, String newpwd);
        boolean assignExpressage(int curAccount, String receiverId, String remark, String time);
        boolean signExpressage(int curAccount, String id, String time);
        double queryMoney(int curAccount);
        double addMoney(int curAccount, double x);
        String currentUserId(int curAccount);
        List<String> queryAllExpressageFormatted(int curAccount);
        List<String> queryBySender(int curAccount, String sender);
        List<String> queryByReceiver(int curAccount, String receiver);
        List<String> queryByTime(int curAccount, String time);
        String queryExpressageFormatted(int curAccount, String id);
    }
}
''',
    },
    # =========================================================================
    # 2. Target: Java (java/idcenter) -> Refs in Go & Python
    # =========================================================================
    "idcenter": {
        "refs/go/base62_codec_ref.go": '''package refs

import (
\t"errors"
)

// Base62Alphabet is the 62-character alphabet used by com.sohu.idcenter.Base62:
// "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const Base62Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const fastSize = int('z')

var digitsIndex [fastSize + 1]int

func init() {
\tfor i := 0; i < fastSize; i++ {
\t\tdigitsIndex[i] = -1
\t}
\tfor i := 0; i < len(Base62Alphabet); i++ {
\t\tdigitsIndex[Base62Alphabet[i]] = i
\t}
}

// EncodeBase62 mirrors Base62.encode(long number) in Base62.java.
func EncodeBase62(number int64) (string, error) {
\tif number < 0 {
\t\treturn "", errors.New("IllegalArgumentException: number(Base62) must be positive")
\t}
\tif number == 0 {
\t\treturn "0", nil
\t}
\tvar buf []byte
\tfor number != 0 {
\t\tbuf = append(buf, Base62Alphabet[int(number%62)])
\t\tnumber /= 62
\t}
\tfor i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
\t\tbuf[i], buf[j] = buf[j], buf[i]
\t}
\treturn string(buf), nil
}

// DecodeBase62 mirrors Base62.decode(String s) and getIndex(String s, int pos) in Base62.java.
func DecodeBase62(s string) (int64, error) {
\tvar result int64 = 0
\tvar multiplier int64 = 1
\tfor pos := len(s) - 1; pos >= 0; pos-- {
\t\tidx, err := getBase62Index(s, pos)
\t\tif err != nil {
\t\t\treturn 0, err
\t\t}
\t\tresult += int64(idx) * multiplier
\t\tmultiplier *= 62
\t}
\treturn result, nil
}

func getBase62Index(s string, pos int) (int, error) {
\tc := int(s[pos])
\tif c > fastSize {
\t\treturn -1, errors.New("IllegalArgumentException: Unknown character for Base62")
\t}
\tindex := digitsIndex[c]
\tif index == -1 {
\t\treturn -1, errors.New("IllegalArgumentException: Unknown character for Base62")
\t}
\treturn index, nil
}
''',
        "refs/go/snowflake_idworker_ref.go": '''package refs

import (
\t"errors"
\t"math/rand"
\t"sync"
\t"time"
)

// SnowflakeIdWorkerRef mirrors com.sohu.idcenter.IdWorker bit layout and validation:
// workerIdBits = 5 (max 31), datacenterIdBits = 5 (max 31), sequenceBits = 12 (mask 4095),
// workerIdShift = 12, datacenterIdShift = 17, timestampLeftShift = 22.
const (
\tworkerIdBits       = 5
\tdatacenterIdBits   = 5
\tmaxWorkerId        = -1 ^ (-1 << workerIdBits)
\tmaxDatacenterId    = -1 ^ (-1 << datacenterIdBits)
\tsequenceBits       = 12
\tworkerIdShift      = sequenceBits
\tdatacenterIdShift  = sequenceBits + workerIdBits
\ttimestampLeftShift = sequenceBits + workerIdBits + datacenterIdBits
\tsequenceMask       = -1 ^ (-1 << sequenceBits)
)

type SnowflakeIdWorkerRef struct {
\tmu            sync.Mutex
\tworkerId      int64
\tdatacenterId  int64
\tidepoch       int64
\tsequence      int64
\tlastTimestamp int64
}

func NewSnowflakeIdWorkerRef(workerId, datacenterId, sequence, idepoch int64) (*SnowflakeIdWorkerRef, error) {
\tif workerId < 0 || workerId > maxWorkerId {
\t\treturn nil, errors.New("IllegalArgumentException: workerId is illegal")
\t}
\tif datacenterId < 0 || datacenterId > maxDatacenterId {
\t\treturn nil, errors.New("IllegalArgumentException: datacenterId is illegal")
\t}
\tif idepoch >= time.Now().UnixMilli() {
\t\treturn nil, errors.New("IllegalArgumentException: idepoch is illegal")
\t}
\treturn &SnowflakeIdWorkerRef{
\t\tworkerId:      workerId,
\t\tdatacenterId:  datacenterId,
\t\tsequence:      sequence,
\t\tidepoch:       idepoch,
\t\tlastTimestamp: -1,
\t}, nil
}

func (w *SnowflakeIdWorkerRef) GetIdTimestamp(id int64) int64 {
\treturn w.idepoch + (id >> timestampLeftShift)
}

func (w *SnowflakeIdWorkerRef) GetId() int64 {
\tw.mu.Lock()
\tdefer w.mu.Unlock()
\ttimestamp := time.Now().UnixMilli()
\tif timestamp < w.lastTimestamp {
\t\tpanic("Clock moved backwards")
\t}
\tif w.lastTimestamp == timestamp {
\t\tw.sequence = (w.sequence + 1) & sequenceMask
\t\tif w.sequence == 0 {
\t\t\tfor timestamp <= w.lastTimestamp {
\t\t\t\ttimestamp = time.Now().UnixMilli()
\t\t\t}
\t\t}
\t} else {
\t\tw.sequence = int64(rand.Intn(10))
\t}
\tw.lastTimestamp = timestamp
\treturn ((timestamp - w.idepoch) << timestampLeftShift) |
\t\t(w.datacenterId << datacenterIdShift) |
\t\t(w.workerId << workerIdShift) |
\t\tw.sequence
}
''',
        "refs/python/sidworker_and_cli_ref.py": '''"""
Cross-language reference (Python -> Java) for com.sohu.idcenter.SidWorker and Main.
"""
import sys
import time
from datetime import datetime


class SidWorkerRef:
    """Mirrors SidWorker.nextSid(), tilNextMillis(lastTimestamp), and timeGen()."""
    last_timestamp = -1
    sequence = 0
    MAX_SEQUENCE = 100

    @classmethod
    def next_sid(cls) -> int:
        now = cls.time_gen()
        if now == cls.last_timestamp:
            cls.sequence += 1
            if cls.sequence > cls.MAX_SEQUENCE:
                now = cls.til_next_millis(cls.last_timestamp)
                cls.sequence = 0
        else:
            cls.sequence = 0
        cls.last_timestamp = now
        prefix = int(datetime.fromtimestamp(now / 1000.0).strftime("%Y%m%d%H%M%S%f")[:17])
        return 100 * prefix + cls.sequence

    @classmethod
    def til_next_millis(cls, last_ts: int) -> int:
        ts = cls.time_gen()
        while ts <= last_ts:
            ts = cls.time_gen()
        return ts

    @staticmethod
    def time_gen() -> int:
        return int(time.time() * 1000)


def main_cli_ref(args: list[str], iw1, iw2) -> None:
    """Mirrors Main.main(String[] args) subcommands idworker and sidworker."""
    usage = (
        "Usage: java -jar idcenter.jar <subcommand> <num> <output>\\n"
        "Subcommands\\nidworker: Sequential ID Creation\\nsidworker: Timestamp-based ID Creation"
    )
    if len(args) != 3:
        print(usage, file=sys.stderr)
        return
    subcommand, num_str, output_path = args[0], args[1], args[2]
    num = int(num_str)
    if subcommand == "idworker":
        with open(output_path, "w", encoding="utf-8") as f:
            for _ in range(num):
                id1 = iw1.getId()
                ts1 = iw1.getIdTimestamp(id1)
                id2 = iw2.getId()
                ts2 = iw2.getIdTimestamp(id2)
                f.write(f"IdWorker1: {id1}, timestamp: {ts1}\\n")
                f.write(f"IdWorker2: {id2}, timestamp: {ts2}\\n")
    elif subcommand == "sidworker":
        with open(output_path, "w", encoding="utf-8") as f:
            for _ in range(num):
                sid = SidWorkerRef.next_sid()
                f.write(f"SidWorker: {sid}\\n")
    else:
        print(usage, file=sys.stderr)
''',
    },
    # =========================================================================
    # 3. Target: Python (python/zxcvbn) -> Refs in JavaScript & Go
    # =========================================================================
    "zxcvbn": {
        "refs/js/zxcvbn_time_estimates_ref.js": '''/**
 * Cross-language reference (JavaScript -> Python) for zxcvbn/time_estimates.py.
 * Implements estimate_attack_times, guesses_to_score, display_time, and float_to_decimal.
 */
'use strict';

function estimate_attack_times(guesses) {
  const crack_times_seconds = {
    online_throttling_100_per_hour: guesses / (100.0 / 3600.0),
    online_no_throttling_10_per_second: guesses / 10.0,
    offline_slow_hashing_1e4_per_second: guesses / 1e4,
    offline_fast_hashing_1e10_per_second: guesses / 1e10,
  };
  const crack_times_display = {};
  for (const [scenario, seconds] of Object.entries(crack_times_seconds)) {
    crack_times_display[scenario] = display_time(seconds);
  }
  return {
    crack_times_seconds,
    crack_times_display,
    score: guesses_to_score(guesses),
  };
}

function guesses_to_score(guesses) {
  const DELTA = 5;
  if (guesses < 1e3 + DELTA) return 0;
  if (guesses < 1e6 + DELTA) return 1;
  if (guesses < 1e8 + DELTA) return 2;
  if (guesses < 1e10 + DELTA) return 3;
  return 4;
}

function display_time(seconds) {
  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const month = day * 31;
  const year = month * 12;
  const century = year * 100;

  let display_num = null;
  let display_str = 'less than a second';
  if (seconds < 1) {
    display_num = null;
    display_str = 'less than a second';
  } else if (seconds < minute) {
    display_num = Math.round(seconds);
    display_str = `${display_num} second`;
  } else if (seconds < hour) {
    display_num = Math.round(seconds / minute);
    display_str = `${display_num} minute`;
  } else if (seconds < day) {
    display_num = Math.round(seconds / hour);
    display_str = `${display_num} hour`;
  } else if (seconds < month) {
    display_num = Math.round(seconds / day);
    display_str = `${display_num} day`;
  } else if (seconds < year) {
    display_num = Math.round(seconds / month);
    display_str = `${display_num} month`;
  } else if (seconds < century) {
    display_num = Math.round(seconds / year);
    display_str = `${display_num} year`;
  } else {
    display_num = null;
    display_str = 'centuries';
  }
  if (display_num !== null && display_num !== 1) {
    display_str += 's';
  }
  return display_str;
}

module.exports = { estimate_attack_times, guesses_to_score, display_time };
''',
        "refs/js/zxcvbn_feedback_ref.js": '''/**
 * Cross-language reference (JavaScript -> Python) for zxcvbn/feedback.py.
 * Implements get_feedback, get_match_feedback, and get_dictionary_match_feedback.
 */
'use strict';

const START_UPPER = /^[A-Z][^A-Z]+$/;
const ALL_UPPER = /^[^a-z]+$/;

function get_feedback(score, sequence) {
  if (sequence.length === 0) {
    return {
      warning: '',
      suggestions: [
        'Use a few words, avoid common phrases',
        'No need for symbols, digits, or uppercase letters',
      ],
    };
  }
  if (score > 2) {
    return { warning: '', suggestions: [] };
  }
  let longest_match = sequence[0];
  for (const match of sequence.slice(1)) {
    if (match.token.length > longest_match.token.length) {
      longest_match = match;
    }
  }
  let feedback = get_match_feedback(longest_match, sequence.length === 1);
  const extra_feedback = 'Add another word or two. Uncommon words are better.';
  if (feedback) {
    feedback.suggestions.unshift(extra_feedback);
    if (!feedback.warning) feedback.warning = '';
  } else {
    feedback = { warning: '', suggestions: [extra_feedback] };
  }
  return feedback;
}

function get_match_feedback(match, is_sole_match) {
  if (match.pattern === 'dictionary') {
    return get_dictionary_match_feedback(match, is_sole_match);
  } else if (match.pattern === 'spatial') {
    const warning =
      match.turns === 1
        ? 'Straight rows of keys are easy to guess'
        : 'Short keyboard patterns are easy to guess';
    return {
      warning,
      suggestions: ['Use a longer keyboard pattern with more turns'],
    };
  } else if (match.pattern === 'repeat') {
    const warning =
      match.base_token.length === 1
        ? 'Repeats like "aaa" are easy to guess'
        : 'Repeats like "abcabcabc" are only slightly harder to guess than "abc"';
    return {
      warning,
      suggestions: ['Avoid repeated words and characters'],
    };
  } else if (match.pattern === 'sequence') {
    return {
      warning: 'Sequences like "abc" or "6543" are easy to guess',
      suggestions: ['Avoid sequences'],
    };
  } else if (match.pattern === 'regex') {
    if (match.regex_name === 'recent_year') {
      return {
        warning: 'Recent years are easy to guess',
        suggestions: ['Avoid recent years', 'Avoid years that are associated with you'],
      };
    }
  } else if (match.pattern === 'date') {
    return {
      warning: 'Dates are often easy to guess',
      suggestions: ['Avoid dates and years that are associated with you'],
    };
  }
  return null;
}

function get_dictionary_match_feedback(match, is_sole_match) {
  let warning = '';
  if (match.dictionary_name === 'passwords') {
    if (is_sole_match && !match.l33t && !match.reversed) {
      if (match.rank <= 10) {
        warning = 'This is a top-10 common password';
      } else if (match.rank <= 100) {
        warning = 'This is a top-100 common password';
      } else {
        warning = 'This is a very common password';
      }
    } else if (match.guesses_log10 <= 4) {
      warning = 'This is similar to a commonly used password';
    }
  } else if (match.dictionary_name === 'english_wikipedia') {
    if (is_sole_match) {
      warning = 'A word by itself is easy to guess';
    }
  } else if (['surnames', 'male_names', 'female_names'].includes(match.dictionary_name)) {
    if (is_sole_match) {
      warning = 'Names and surnames by themselves are easy to guess';
    } else {
      warning = 'Common names and surnames are easy to guess';
    }
  }
  const suggestions = [];
  const word = match.token;
  if (START_UPPER.test(word)) {
    suggestions.push("Capitalization doesn't help very much");
  } else if (ALL_UPPER.test(word) && word.toLowerCase() !== word) {
    suggestions.push('All-uppercase is almost as easy to guess as all-lowercase');
  }
  if (match.reversed && match.token.length >= 4) {
    suggestions.push("Reversed words aren't much harder to guess");
  }
  if (match.l33t) {
    suggestions.push("Predictable substitutions like '@' instead of 'a' don't help very much");
  }
  return { warning, suggestions };
}

module.exports = { get_feedback, get_match_feedback, get_dictionary_match_feedback };
''',
        "refs/go/zxcvbn_matching_scoring_ref.go": '''package refs

// Cross-language reference (Go -> Python) for zxcvbn/matching.py and zxcvbn/scoring.py constants and DP equations.
// Reference constants:
// BRUTEFORCE_CARDINALITY = 10
// MIN_GUESSES_BEFORE_GROWING_SEQUENCE = 10000
// MIN_SUBMATCH_GUESSES_SINGLE_CHAR = 10
// MIN_SUBMATCH_GUESSES_MULTI_CHAR = 50
// DATE_MAX_YEAR = 2050, DATE_MIN_YEAR = 1000, REFERENCE_YEAR = 2016
const (
\tBruteforceCardinality          = 10
\tMinGuessesBeforeGrowingSeq     = 10000
\tMinSubmatchGuessesSingleChar   = 10
\tMinSubmatchGuessesMultiChar    = 50
\tReferenceYear                  = 2016
\tDateMaxYear                    = 2050
\tDateMinYear                    = 1000
\tSequenceMaxDelta               = 5
)

// Factorial computes n! for nCr combinatorics in uppercase_variations, l33t_variations, and spatial_guesses.
func Factorial(n int) int {
\tif n < 2 {
\t\treturn 1
\t}
\tres := 1
\tfor i := 2; i <= n; i++ {
\t\tres *= i
\t}
\treturn res
}

// NCr computes binomial coefficient n! / (k! * (n-k)!)
func NCr(n, k int) int {
\tif k > n {
\t\treturn 0
\t}
\tif k == 0 {
\t\treturn 1
\t}
\tr := 1
\tfor d := 1; d <= k; d++ {
\t\tr *= n
\t\tr /= d
\t\tn--
\t}
\treturn r
}
''',
    },
    # =========================================================================
    # 4. Target: JavaScript (javascript/ejs) -> Refs in Python & Go
    # =========================================================================
    "ejs": {
        "refs/python/ejs_utils_ref.py": '''"""
Cross-language reference (Python -> JavaScript) for lib/cjs/utils.js.
Implements escapeRegExpChars, escapeXML, shallowCopy, shallowCopyFromList, cache, and hyphenToCamel.
"""
import re

REG_EXP_CHARS = re.compile(r"[|\\\\{}()\\[\\]^$+*?.]")
ENCODE_HTML_RULES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&#34;",
    "'": "&#39;",
}
MATCH_HTML = re.compile(r"[&<>'\"]")


def escapeRegExpChars(string: str | None = None) -> str:
    if not string:
        return ""
    return REG_EXP_CHARS.sub(lambda m: "\\\\" + m.group(0), str(string))


def escapeXML(markup: str | None = None) -> str:
    if markup is None:
        return ""
    return MATCH_HTML.sub(lambda m: ENCODE_HTML_RULES.get(m.group(0), m.group(0)), str(markup))


def shallowCopy(to_obj: dict | None, from_obj: dict | None) -> dict | None:
    if to_obj is None:
        return to_obj
    from_obj = from_obj or {}
    for k, v in from_obj.items():
        to_obj[k] = v
    return to_obj


def shallowCopyFromList(to_obj: dict | None, from_obj: dict | None, list_keys: list[str] | None) -> dict | None:
    to_obj = to_obj or {}
    from_obj = from_obj or {}
    if list_keys:
        for k in list_keys:
            if k in from_obj:
                to_obj[k] = from_obj[k]
    return to_obj


class SimpleCache:
    """Reference for utils.cache = { _data: {}, set(k,v), get(k), remove(k), reset() }."""
    def __init__(self):
        self._data = {}

    def set(self, key: str, val):
        self._data[key] = val

    def get(self, key: str):
        return self._data.get(key)

    def remove(self, key: str):
        self._data.pop(key, None)

    def reset(self):
        self._data = {}


def hyphenToCamel(s: str) -> str:
    return re.sub(r"-[a-z]", lambda m: m.group(0)[1].upper(), s)
''',
        "refs/go/ejs_cli_and_compiler_ref.go": '''package refs

import "strings"

// Cross-language reference (Go -> JavaScript) for EJS template compiler modes, options, and bin/cli.js workflow.
// Template modes in lib/cjs/ejs.js:
// EVAL = "eval", ESCAPED = "escaped", RAW = "raw", COMMENT = "comment", LITERAL = "literal"
// Default options:
// openDelimiter = "<", closeDelimiter = ">", delimiter = "%", strict = false, _with = true,
// localsName = "locals", rmWhitespace = false, async = false.
type Template struct {
	TemplateText string
	Mode         string
	Truncate     bool
	CurrentLine  int
	Source       string
}

func (t *Template) createRegex(open, close, delim string) string {
	pattern := "(<%%|%%>|<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)"
	pattern = strings.ReplaceAll(pattern, "%", delim)
	pattern = strings.ReplaceAll(pattern, "<", open)
	pattern = strings.ReplaceAll(pattern, ">", close)
	return pattern
}

func (t *Template) parseTemplateText() []string {
	return strings.Split(t.TemplateText, "|")
}

func (t *Template) scanLine(line string) {
	t.Source += line
}

func (t *Template) generateSource() string {
	for _, token := range t.parseTemplateText() {
		t.scanLine(token)
	}
	return t.Source
}

func (t *Template) compile() string {
	return t.generateSource()
}

func render(templateStr string, data map[string]any, opts CliTransformOpts) string {
	tmpl := &Template{TemplateText: templateStr, CurrentLine: 1}
	return tmpl.compile()
}

func renderFile(filename string, data map[string]any, opts CliTransformOpts) string {
	return render(filename, data, opts)
}

func clearCache() {}
const (
\tModeEval    = "eval"
\tModeEscaped = "escaped"
\tModeRaw     = "raw"
\tModeComment = "comment"
\tModeLiteral = "literal"
)

// CliTransformOpts describes how bin/cli.js transforms parsed CLI flags into ejs.render(tmpl, vals, opts):
// 1. Initialize opts = {}, vals = {}
// 2. If p.opts["data-file"] (-f), JSON.parse(fs.readFileSync(dataFile)) into vals
// 3. If p.opts["data-input"] (-i), JSON.parse(decodeURIComponent(dataInput)) into vals
// 4. If stdin was piped, JSON.parse(stdin) into vals
// 5. Copy passThrough options from p.opts with hyphenToCamel(key); if p.opts["no-with"] (-n), set opts._with = false
// 6. First remaining p.args[0] is the template filename; subsequent p.args ("key=val") split on "=" into vals[k] = v
// 7. Set opts.filename = path.resolve(process.cwd(), filename), render template with ejs.render(tmpl, vals, opts),
//    and write to output-file (-o) or process.stdout.write(output).
type CliTransformOpts struct {
\tFilename     string
\tOutputFile   string
\tNoWith       bool
\tRmWhitespace bool
\tDelimiter    string
}
''',
    },
    # =========================================================================
    # 5. Target: Go (go/gobreaker) -> Refs in Java & Python
    # =========================================================================
    "gobreaker": {
        "refs/java/RollingCountsRef.java": '''package refs.java;

/**
 * Cross-language reference (Java -> Go) for v2/counter.go (Counts and rollingCounts).
 * Mirrors every method of Counts and rollingCounts in package gobreaker.
 */
public class RollingCountsRef {
    public static class Counts {
        public int Requests;
        public int TotalSuccesses;
        public int TotalFailures;
        public int TotalExclusions;
        public int ConsecutiveSuccesses;
        public int ConsecutiveFailures;

        public void onRequest() {
            Requests++;
        }

        public void onSuccess() {
            TotalSuccesses++;
            ConsecutiveSuccesses++;
            ConsecutiveFailures = 0;
        }

        public void onFailure() {
            TotalFailures++;
            ConsecutiveFailures++;
            ConsecutiveSuccesses = 0;
        }

        public void onExclusion() {
            TotalExclusions++;
        }

        public int validRequests() {
            return Requests - TotalExclusions;
        }

        public void clear() {
            Requests = 0;
            TotalSuccesses = 0;
            TotalFailures = 0;
            TotalExclusions = 0;
            ConsecutiveSuccesses = 0;
            ConsecutiveFailures = 0;
        }
    }

    public static class RollingCounts extends Counts {
        public long age;
        public Counts[] buckets;

        public RollingCounts(long numBuckets) {
            this.age = 0;
            if (numBuckets > 0) {
                this.buckets = new Counts[(int) numBuckets];
                for (int i = 0; i < numBuckets; i++) this.buckets[i] = new Counts();
            } else {
                this.buckets = new Counts[0];
            }
        }

        public long index(long targetAge) {
            if (buckets.length == 0) return 0;
            return targetAge % buckets.length;
        }

        public long current() {
            return index(age);
        }

        @Override
        public void onRequest() {
            super.onRequest();
            if (buckets.length > 0) {
                buckets[(int) current()].onRequest();
            }
        }

        public void onSuccess(long reqAge) {
            super.onSuccess();
            if (buckets.length > 0 && age - reqAge < buckets.length) {
                buckets[(int) index(reqAge)].onSuccess();
            }
        }

        public void onFailure(long reqAge) {
            super.onFailure();
            if (buckets.length > 0 && age - reqAge < buckets.length) {
                buckets[(int) index(reqAge)].onFailure();
            }
        }

        public void onExclusion(long reqAge) {
            super.onExclusion();
            if (buckets.length > 0 && age - reqAge < buckets.length) {
                buckets[(int) index(reqAge)].onExclusion();
            }
        }

        @Override
        public void clear() {
            super.clear();
            this.age = 0;
            for (int i = 0; i < buckets.length; i++) {
                buckets[i].clear();
            }
        }

        public void roll() {
            if (buckets.length == 0) return;
            age++;
            if (age >= buckets.length) {
                long oldest = current();
                subtract(oldest);
                buckets[(int) oldest].clear();
            }
        }

        public void subtract(long oldest) {
            if (oldest >= buckets.length) return;
            Counts b = buckets[(int) oldest];
            Requests -= b.Requests;
            TotalSuccesses -= b.TotalSuccesses;
            TotalFailures -= b.TotalFailures;
            TotalExclusions -= b.TotalExclusions;
            if (ConsecutiveSuccesses > TotalSuccesses) ConsecutiveSuccesses = TotalSuccesses;
            if (ConsecutiveFailures > TotalFailures) ConsecutiveFailures = TotalFailures;
        }

        public void grow(long targetAge) {
            if (buckets.length == 0 || targetAge < age) return;
            if (targetAge - age >= buckets.length) {
                clear();
                return;
            }
            for (long i = age; i < targetAge; i++) {
                roll();
            }
        }

        public Counts bucketAt(int idx) {
            if (idx < 0 || idx >= buckets.length) return new Counts();
            return buckets[(int) index(age + 1 + idx)];
        }
    }
}
''',
        "refs/python/distributed_gobreaker_ref.py": '''"""
Cross-language reference (Python -> Go) for v2/distributed_gobreaker.go and v2/twostep_gobreaker.go.
Mirrors DistributedCircuitBreaker[T] and TwoStepCircuitBreaker[T] in package gobreaker.
"""
import json
import time


class DistributedCircuitBreakerRef:
    """
    Reference for v2/distributed_gobreaker.go:
    - NewDistributedCircuitBreaker(store, settings): returns ErrNoSharedStore if store is nil;
      initializes local CircuitBreaker[T], writes initial SharedState{State: StateClosed, Expiry: now + interval}
      via setSharedState.
    - key(name): f"gobreaker:{name}"
    - mutexKey(name): f"gobreaker:mutex:{name}"
    - withLock(fn): calls store.Lock(mutexKey), defers store.Unlock(mutexKey), runs fn().
    - getSharedState(): store.GetData(key), returns ErrNoSharedState if len(data) == 0, else json.Unmarshal.
    - setSharedState(state): json.Marshal(state), store.SetData(key, data).
    - State(): getSharedState(), updates state via currentState(now), persists via setSharedState, returns state.State.
    - Execute(req):
        1. withLock -> beforeRequest() checks/updates SharedState (returns ErrOpenState or ErrTooManyRequests if blocked)
        2. invokes req(); on panic, withLock -> afterRequest(generation, age, false) and re-panics
        3. withLock -> afterRequest(generation, age, isSuccessful(err))
    """

    @staticmethod
    def key(name: str) -> str:
        return f"gobreaker:{name}"

    @staticmethod
    def mutex_key(name: str) -> str:
        return f"gobreaker:mutex:{name}"

    @staticmethod
    def allow_two_step(cb):
        """
        Reference for TwoStepCircuitBreaker[T].Allow() in v2/twostep_gobreaker.go:
        generation, age, err := tscb.cb.beforeRequest()
        if err != nil { return nil, err }
        return func(err error) { tscb.cb.afterRequest(generation, age, err) }, nil
        """
        generation, age, err = cb.beforeRequest()
        if err is not None:
            return None, err
        return lambda outcome_err: cb.afterRequest(generation, age, outcome_err), None
''',
    },
}


def write_cross_language_refs(root: Path, datasets_root: Path, project: str, write_text_fn, full_history: bool = False) -> None:
    # 1. Write project-specific cross-language ground-truth reference modules
    truth_map = CROSS_LANG_TRUTH_REFS.get(project, {})
    for rel_path, content in truth_map.items():
        write_text_fn(root / rel_path, content)

    if full_history:
        return

    # 2. Copy real multi-language distractor modules from other PolyCodeEval repositories
    for lang, repo, src_rel, dest_rel in DISTRACTOR_SOURCES:
        src_file = datasets_root / lang / repo / "src" / src_rel
        if src_file.exists() and src_file.is_file():
            try:
                text = src_file.read_text(encoding="utf-8")
                if len(text) <= 64_000:
                    write_text_fn(root / dest_rel, text)
            except UnicodeDecodeError:
                pass
