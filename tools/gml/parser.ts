// Recursive-descent GML parser producing a small AST.
import { lex, type Token } from './lexer.ts';

export type Expr =
  | { t: 'num'; v: number; int: boolean }
  | { t: 'str'; v: string }
  | { t: 'tmpl'; parts: (string | Expr)[] }
  | { t: 'id'; name: string }
  | { t: 'member'; obj: Expr; name: string }
  | { t: 'index'; obj: Expr; idx: Expr[]; acc: string | null }
  | { t: 'call'; callee: Expr; args: Expr[] }
  | { t: 'new'; callee: Expr; args: Expr[] }
  | { t: 'unary'; op: string; arg: Expr }
  | { t: 'update'; op: '++' | '--'; prefix: boolean; arg: Expr }
  | { t: 'bin'; op: string; l: Expr; r: Expr }
  | { t: 'cond'; test: Expr; a: Expr; b: Expr }
  | { t: 'array'; items: Expr[] }
  | { t: 'struct'; props: [string, Expr][] }
  | { t: 'func'; fn: FuncDef };

export interface Param { name: string; def: Expr | null }
export interface FuncDef {
  name: string | null;
  params: Param[];
  body: Stmt[];
  ctor: boolean;
  parent: { name: string; args: Expr[] } | null;
}

export type Stmt =
  | { t: 'var'; decls: { name: string; init: Expr | null }[] }
  | { t: 'globalvar'; names: string[] }
  | { t: 'static'; decls: { name: string; init: Expr | null }[] }
  | { t: 'assign'; op: string; target: Expr; value: Expr }
  | { t: 'expr'; e: Expr }
  | { t: 'if'; test: Expr; then: Stmt[]; else: Stmt[] | null }
  | { t: 'while'; test: Expr; body: Stmt[] }
  | { t: 'do'; body: Stmt[]; until: Expr }
  | { t: 'for'; init: Stmt | null; test: Expr | null; step: Stmt | null; body: Stmt[] }
  | { t: 'repeat'; count: Expr; body: Stmt[] }
  | { t: 'switch'; disc: Expr; cases: { test: Expr | null; body: Stmt[] }[] }
  | { t: 'with'; target: Expr; body: Stmt[] }
  | { t: 'break' }
  | { t: 'continue' }
  | { t: 'exit' }
  | { t: 'return'; arg: Expr | null }
  | { t: 'block'; body: Stmt[] }
  | { t: 'func'; fn: FuncDef }
  | { t: 'enum'; name: string; members: { name: string; value: number }[] }
  | { t: 'delete'; target: Expr }
  | { t: 'throw'; arg: Expr }
  | { t: 'try'; body: Stmt[]; catchName: string | null; catchBody: Stmt[] | null; finallyBody: Stmt[] | null };

export class ParseError extends Error {}

const BIN_PREC: Record<string, number> = {
  '??': 1,
  '||': 2, '^^': 3, '&&': 4,
  '==': 5, '!=': 5, '<': 6, '<=': 6, '>': 6, '>=': 6,
  '|': 7, '^': 8, '&': 9,
  '<<': 10, '>>': 10,
  '+': 11, '-': 11,
  '*': 12, '/': 12, '%': 12, 'mod': 12, 'div': 12,
};

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<=', '>>=', '??=']);

export class Parser {
  private toks: Token[];
  private p = 0;
  constructor(src: string) { this.toks = lex(src); }

  private peek(o = 0): Token { return this.toks[this.p + o]; }
  private next(): Token { return this.toks[this.p++]; }
  private isOp(v: string, o = 0): boolean { const t = this.peek(o); return t.kind === 'op' && t.value === v; }
  private isKw(v: string, o = 0): boolean { const t = this.peek(o); return t.kind === 'id' && t.value === v; }
  private eatOp(v: string): boolean { if (this.isOp(v)) { this.p++; return true; } return false; }
  private expectOp(v: string): void {
    if (!this.eatOp(v)) throw this.err(`expected '${v}'`);
  }
  private expectId(): string {
    const t = this.next();
    if (t.kind !== 'id') throw this.err(`expected identifier, got '${t.value}'`, t);
    return t.value;
  }
  private err(msg: string, t = this.peek()): ParseError {
    return new ParseError(`${msg} at line ${t.line} (near '${t.value}')`);
  }

  parseProgram(): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      const s = this.statement();
      if (s) out.push(s);
    }
    return out;
  }

  private block(): Stmt[] {
    if (this.isOp('{')) {
      this.next();
      const out: Stmt[] = [];
      while (!this.isOp('}')) {
        if (this.peek().kind === 'eof') throw this.err('unexpected eof in block');
        const s = this.statement();
        if (s) out.push(s);
      }
      this.next();
      return out;
    }
    const s = this.statement();
    return s ? [s] : [];
  }

  private endStmt(): void { while (this.eatOp(';')) { /* optional */ } }

  private statement(): Stmt | null {
    const t = this.peek();
    if (t.kind === 'op' && t.value === ';') { this.next(); return null; }
    if (t.kind === 'op' && t.value === '{') { return { t: 'block', body: this.block() }; }
    if (t.kind === 'id') {
      switch (t.value) {
        case 'var': {
          this.next();
          const decls = this.declList();
          this.endStmt();
          return { t: 'var', decls };
        }
        case 'static': {
          this.next();
          const decls = this.declList();
          this.endStmt();
          return { t: 'static', decls };
        }
        case 'globalvar': {
          this.next();
          const names = [this.expectId()];
          while (this.eatOp(',')) names.push(this.expectId());
          this.endStmt();
          return { t: 'globalvar', names };
        }
        case 'if': {
          this.next();
          const test = this.expr();
          this.eatKw('then');
          const then = this.block();
          let els: Stmt[] | null = null;
          if (this.isKw('else')) { this.next(); els = this.block(); }
          return { t: 'if', test, then, else: els };
        }
        case 'while': {
          this.next();
          const test = this.expr();
          this.eatKw('do');
          return { t: 'while', test, body: this.block() };
        }
        case 'do': {
          this.next();
          const body = this.block();
          if (!this.isKw('until')) throw this.err("expected 'until'");
          this.next();
          const until = this.expr();
          this.endStmt();
          return { t: 'do', body, until };
        }
        case 'for': {
          this.next();
          this.expectOp('(');
          const init = this.isOp(';') ? null : this.simpleStatement();
          this.expectOp(';');
          const test = this.isOp(';') ? null : this.expr();
          this.expectOp(';');
          const step = this.isOp(')') ? null : this.simpleStatement();
          this.expectOp(')');
          return { t: 'for', init, test, step, body: this.block() };
        }
        case 'repeat': {
          this.next();
          const count = this.expr();
          return { t: 'repeat', count, body: this.block() };
        }
        case 'with': {
          this.next();
          const target = this.expr();
          return { t: 'with', target, body: this.block() };
        }
        case 'switch': {
          this.next();
          const disc = this.expr();
          this.expectOp('{');
          const cases: { test: Expr | null; body: Stmt[] }[] = [];
          while (!this.isOp('}')) {
            let test: Expr | null;
            if (this.isKw('case')) { this.next(); test = this.expr(); }
            else if (this.isKw('default')) { this.next(); test = null; }
            else throw this.err('expected case/default');
            this.expectOp(':');
            const body: Stmt[] = [];
            while (!this.isKw('case') && !this.isKw('default') && !this.isOp('}')) {
              const s = this.statement();
              if (s) body.push(s);
            }
            cases.push({ test, body });
          }
          this.next();
          return { t: 'switch', disc, cases };
        }
        case 'break': this.next(); this.endStmt(); return { t: 'break' };
        case 'continue': this.next(); this.endStmt(); return { t: 'continue' };
        case 'exit': this.next(); this.endStmt(); return { t: 'exit' };
        case 'return': {
          this.next();
          let arg: Expr | null = null;
          if (!this.isOp(';') && !this.isOp('}')) arg = this.expr();
          this.endStmt();
          return { t: 'return', arg };
        }
        case 'function': {
          if (this.peek(1).kind === 'id') {
            this.next();
            const fn = this.funcRest(this.expectId());
            return { t: 'func', fn };
          }
          break;
        }
        case 'enum': {
          this.next();
          const name = this.expectId();
          this.expectOp('{');
          const members: { name: string; value: number }[] = [];
          let v = 0;
          while (!this.isOp('}')) {
            const m = this.expectId();
            if (this.eatOp('=')) {
              const e = this.expr();
              v = constNum(e);
            }
            members.push({ name: m, value: v });
            v++;
            if (!this.eatOp(',')) break;
          }
          this.expectOp('}');
          return { t: 'enum', name, members };
        }
        case 'delete': {
          this.next();
          const target = this.expr();
          this.endStmt();
          return { t: 'delete', target };
        }
        case 'throw': {
          this.next();
          const arg = this.expr();
          this.endStmt();
          return { t: 'throw', arg };
        }
        case 'try': {
          this.next();
          const body = this.block();
          let catchName: string | null = null;
          let catchBody: Stmt[] | null = null;
          let finallyBody: Stmt[] | null = null;
          if (this.isKw('catch')) {
            this.next();
            this.expectOp('(');
            catchName = this.expectId();
            this.expectOp(')');
            catchBody = this.block();
          }
          if (this.isKw('finally')) { this.next(); finallyBody = this.block(); }
          return { t: 'try', body, catchName, catchBody, finallyBody };
        }
      }
    }
    const s = this.simpleStatement();
    this.endStmt();
    return s;
  }

  private eatKw(v: string): boolean { if (this.isKw(v)) { this.p++; return true; } return false; }

  private declList(): { name: string; init: Expr | null }[] {
    const decls: { name: string; init: Expr | null }[] = [];
    do {
      const name = this.expectId();
      let init: Expr | null = null;
      if (this.eatOp('=')) init = this.expr();
      decls.push({ name, init });
    } while (this.eatOp(','));
    return decls;
  }

  /** assignment or expression statement (no trailing ';' handling) */
  private simpleStatement(): Stmt {
    if (this.isKw('var')) {
      this.next();
      return { t: 'var', decls: this.declList() };
    }
    const e = this.expr();
    const t = this.peek();
    if (t.kind === 'op' && ASSIGN_OPS.has(t.value)) {
      this.next();
      const value = this.expr();
      return { t: 'assign', op: t.value, target: e, value };
    }
    return { t: 'expr', e };
  }

  private funcRest(name: string | null): FuncDef {
    this.expectOp('(');
    const params: Param[] = [];
    while (!this.isOp(')')) {
      const pn = this.expectId();
      let def: Expr | null = null;
      if (this.eatOp('=')) def = this.expr();
      params.push({ name: pn, def });
      if (!this.eatOp(',')) break;
    }
    this.expectOp(')');
    let parent: { name: string; args: Expr[] } | null = null;
    if (this.eatOp(':')) {
      const pn = this.expectId();
      this.expectOp('(');
      parent = { name: pn, args: this.args(')') };
    }
    let ctor = false;
    if (this.isKw('constructor')) { this.next(); ctor = true; }
    const body = this.block();
    return { name, params, body, ctor, parent };
  }

  private args(close: string): Expr[] {
    const out: Expr[] = [];
    while (!this.isOp(close)) {
      out.push(this.expr());
      if (!this.eatOp(',')) break;
    }
    this.expectOp(close);
    return out;
  }

  expr(): Expr {
    return this.ternary();
  }

  private ternary(): Expr {
    const test = this.binary(0);
    if (this.isOp('?')) {
      this.next();
      const a = this.expr();
      this.expectOp(':');
      const b = this.expr();
      return { t: 'cond', test, a, b };
    }
    return test;
  }

  private binOp(): string | null {
    const t = this.peek();
    if (t.kind === 'op' && t.value in BIN_PREC) return t.value;
    if (t.kind === 'id' && (t.value === 'mod' || t.value === 'div' || t.value === 'and' || t.value === 'or' || t.value === 'xor')) {
      return t.value === 'and' ? '&&' : t.value === 'or' ? '||' : t.value === 'xor' ? '^^' : t.value;
    }
    return null;
  }

  private binary(minPrec: number): Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = BIN_PREC[op];
      if (prec <= minPrec - 1 || prec < minPrec) break;
      this.next();
      const right = this.binary(prec + 1);
      left = { t: 'bin', op, l: left, r: right };
    }
    return left;
  }

  private unary(): Expr {
    const t = this.peek();
    if (t.kind === 'op') {
      if (t.value === '!' || t.value === '-' || t.value === '~' || t.value === '+') {
        this.next();
        const arg = this.unary();
        if (t.value === '-' && arg.t === 'num') return { t: 'num', v: -arg.v, int: arg.int };
        if (t.value === '+') return arg;
        return { t: 'unary', op: t.value, arg };
      }
      if (t.value === '++' || t.value === '--') {
        this.next();
        return { t: 'update', op: t.value, prefix: true, arg: this.unary() };
      }
    }
    if (t.kind === 'id' && t.value === 'not') { this.next(); return { t: 'unary', op: '!', arg: this.unary() }; }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op') break;
      if (t.value === '.') {
        this.next();
        const nt = this.next();
        if (nt.kind !== 'id') throw this.err('expected member name', nt);
        e = { t: 'member', obj: e, name: nt.value };
      } else if (t.value === '[' || t.value === '[@' || t.value === '[?' || t.value === '[|' || t.value === '[#' || t.value === '[$') {
        this.next();
        const acc = t.value === '[' ? null : t.value.slice(1);
        const idx = [this.expr()];
        while (this.eatOp(',')) idx.push(this.expr());
        this.expectOp(']');
        e = { t: 'index', obj: e, idx, acc };
      } else if (t.value === '(') {
        this.next();
        e = { t: 'call', callee: e, args: this.args(')') };
      } else if (t.value === '++' || t.value === '--') {
        this.next();
        e = { t: 'update', op: t.value, prefix: false, arg: e };
      } else break;
    }
    return e;
  }

  private primary(): Expr {
    const t = this.next();
    switch (t.kind) {
      case 'num': return { t: 'num', v: t.num!, int: !!t.int };
      case 'str': return { t: 'str', v: t.value };
      case 'tmpl': {
        const parts: (string | Expr)[] = t.parts!.map((p, i) => (i % 2 === 0 ? p : new Parser(p).expr()));
        return { t: 'tmpl', parts };
      }
      case 'id': {
        if (t.value === 'function') {
          let name: string | null = null;
          if (this.peek().kind === 'id') name = this.expectId();
          return { t: 'func', fn: this.funcRest(name) };
        }
        if (t.value === 'new') {
          const callee = this.newCallee();
          let args: Expr[] = [];
          if (this.eatOp('(')) args = this.args(')');
          return { t: 'new', callee, args };
        }
        return { t: 'id', name: t.value };
      }
      case 'op': {
        if (t.value === '(') {
          const e = this.expr();
          this.expectOp(')');
          return e;
        }
        if (t.value === '[') return { t: 'array', items: this.args(']') };
        if (t.value === '{') {
          const props: [string, Expr][] = [];
          while (!this.isOp('}')) {
            const kt = this.next();
            const key = kt.value;
            if (kt.kind !== 'id' && kt.kind !== 'str') throw this.err('bad struct key', kt);
            if (this.eatOp(':')) props.push([key, this.expr()]);
            else props.push([key, { t: 'id', name: key }]);
            if (!this.eatOp(',')) break;
          }
          this.expectOp('}');
          return { t: 'struct', props };
        }
        break;
      }
    }
    throw this.err(`unexpected token '${t.value}'`, t);
  }

  private newCallee(): Expr {
    let e: Expr = { t: 'id', name: this.expectId() };
    while (this.isOp('.')) {
      this.next();
      e = { t: 'member', obj: e, name: this.expectId() };
    }
    return e;
  }
}

function constNum(e: Expr): number {
  if (e.t === 'num') return e.v;
  if (e.t === 'unary' && e.op === '-') return -constNum(e.arg);
  throw new ParseError('enum value must be constant');
}

export function parse(src: string): Stmt[] {
  return new Parser(src).parseProgram();
}
