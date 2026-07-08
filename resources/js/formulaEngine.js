/**
 * Formula Engine for custom field formulas.
 *
 * Pipeline: tokenize → parse (recursive descent) → evaluate
 *
 * Supports:
 * - Field references: {Field Name}, {Due Date}, {Start Date}, {Created Date}
 * - Arithmetic: +, -, *, /, % (modulo), unary -
 * - Comparison: >, <, >=, <=, ==, !=
 * - Parentheses for grouping
 * - Functions: ABS, ROUND, CEIL, FLOOR, MIN, MAX, SUM, AVG, POWER, SQRT,
 *              DATE_ADD, DATE_SUB, DATE_DIFF, TODAY, IF
 */

// ── Token Types ──────────────────────────────────────────────────────────────

const T = {
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    FIELD_REF: 'FIELD_REF',
    FUNC: 'FUNC',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    STAR: 'STAR',
    SLASH: 'SLASH',
    PERCENT: 'PERCENT',
    GT: 'GT',
    GTE: 'GTE',
    LT: 'LT',
    LTE: 'LTE',
    EQ: 'EQ',
    NEQ: 'NEQ',
    EOF: 'EOF',
};

const KNOWN_FUNCTIONS = new Set([
    'ABS', 'ROUND', 'CEIL', 'FLOOR', 'MIN', 'MAX', 'SUM', 'AVG',
    'POWER', 'SQRT', 'DATE_ADD', 'DATE_SUB', 'DATE_DIFF', 'TODAY', 'IF',
]);

// ── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(formula) {
    const tokens = [];
    let i = 0;
    const src = formula;

    while (i < src.length) {
        const ch = src[i];

        // Skip whitespace
        if (/\s/.test(ch)) { i++; continue; }

        // Field reference: {Field Name}
        if (ch === '{') {
            const end = src.indexOf('}', i + 1);
            if (end === -1) throw new Error('Unterminated field reference — missing closing }');
            tokens.push({ type: T.FIELD_REF, value: src.slice(i + 1, end).trim() });
            i = end + 1;
            continue;
        }

        // String literal: "..."
        if (ch === '"') {
            const end = src.indexOf('"', i + 1);
            if (end === -1) throw new Error('Unterminated string literal');
            tokens.push({ type: T.STRING, value: src.slice(i + 1, end) });
            i = end + 1;
            continue;
        }

        // Number: digits with optional decimal
        if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
            let num = '';
            while (i < src.length && (/[0-9]/.test(src[i]) || (src[i] === '.' && !num.includes('.')))) {
                num += src[i++];
            }
            tokens.push({ type: T.NUMBER, value: parseFloat(num) });
            continue;
        }

        // Two-character operators
        if (ch === '>' && src[i + 1] === '=') { tokens.push({ type: T.GTE }); i += 2; continue; }
        if (ch === '<' && src[i + 1] === '=') { tokens.push({ type: T.LTE }); i += 2; continue; }
        if (ch === '=' && src[i + 1] === '=') { tokens.push({ type: T.EQ }); i += 2; continue; }
        if (ch === '!' && src[i + 1] === '=') { tokens.push({ type: T.NEQ }); i += 2; continue; }

        // Single-character operators
        const singles = { '(': T.LPAREN, ')': T.RPAREN, ',': T.COMMA, '+': T.PLUS, '-': T.MINUS, '*': T.STAR, '/': T.SLASH, '%': T.PERCENT, '>': T.GT, '<': T.LT };
        if (singles[ch]) { tokens.push({ type: singles[ch] }); i++; continue; }

        // Identifier (function name)
        if (/[A-Za-z_]/.test(ch)) {
            let ident = '';
            while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
                ident += src[i++];
            }
            const upper = ident.toUpperCase();
            if (KNOWN_FUNCTIONS.has(upper)) {
                tokens.push({ type: T.FUNC, value: upper });
            } else {
                throw new Error(`Unknown identifier "${ident}". Did you mean to use {${ident}} for a field reference?`);
            }
            continue;
        }

        throw new Error(`Unexpected character "${ch}" at position ${i}`);
    }

    tokens.push({ type: T.EOF });
    return tokens;
}

// ── Parser (Recursive Descent) ───────────────────────────────────────────────
//
// Grammar (descending precedence):
//   expression     → comparison
//   comparison     → addition ( ( '>' | '>=' | '<' | '<=' | '==' | '!=' ) addition )*
//   addition       → multiplication ( ( '+' | '-' ) multiplication )*
//   multiplication → unary ( ( '*' | '/' | '%' ) unary )*
//   unary          → ( '-' ) unary | primary
//   primary        → NUMBER | STRING | FIELD_REF | FUNC '(' arglist ')' | '(' expression ')'
//   arglist        → expression ( ',' expression )*

function parse(tokens) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function advance() { return tokens[pos++]; }
    function expect(type) {
        const tok = advance();
        if (tok.type !== type) throw new Error(`Expected ${type} but got ${tok.type}`);
        return tok;
    }

    function expression() { return comparison(); }

    function comparison() {
        let left = addition();
        const compOps = [T.GT, T.GTE, T.LT, T.LTE, T.EQ, T.NEQ];
        while (compOps.includes(peek().type)) {
            const op = advance().type;
            const right = addition();
            left = { type: 'Comparison', op, left, right };
        }
        return left;
    }

    function addition() {
        let left = multiplication();
        while (peek().type === T.PLUS || peek().type === T.MINUS) {
            const op = advance().type;
            const right = multiplication();
            left = { type: 'BinaryOp', op, left, right };
        }
        return left;
    }

    function multiplication() {
        let left = unary();
        while (peek().type === T.STAR || peek().type === T.SLASH || peek().type === T.PERCENT) {
            const op = advance().type;
            const right = unary();
            left = { type: 'BinaryOp', op, left, right };
        }
        return left;
    }

    function unary() {
        if (peek().type === T.MINUS) {
            advance();
            return { type: 'UnaryOp', op: T.MINUS, operand: unary() };
        }
        return primary();
    }

    function primary() {
        const tok = peek();

        if (tok.type === T.NUMBER) {
            advance();
            return { type: 'NumberLiteral', value: tok.value };
        }

        if (tok.type === T.STRING) {
            advance();
            return { type: 'StringLiteral', value: tok.value };
        }

        if (tok.type === T.FIELD_REF) {
            advance();
            return { type: 'FieldRef', name: tok.value };
        }

        if (tok.type === T.FUNC) {
            const name = advance().value;
            expect(T.LPAREN);
            const args = [];
            if (peek().type !== T.RPAREN) {
                args.push(expression());
                while (peek().type === T.COMMA) {
                    advance();
                    args.push(expression());
                }
            }
            expect(T.RPAREN);
            return { type: 'FunctionCall', name, args };
        }

        if (tok.type === T.LPAREN) {
            advance();
            const expr = expression();
            expect(T.RPAREN);
            return expr;
        }

        throw new Error(`Unexpected token ${tok.type}${tok.value != null ? ` "${tok.value}"` : ''}`);
    }

    const ast = expression();
    if (peek().type !== T.EOF) {
        throw new Error(`Unexpected token after expression: ${peek().type}`);
    }
    return ast;
}

// ── Evaluator ────────────────────────────────────────────────────────────────

function isDateValue(v) {
    return v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v));
}

function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d)) return d;
    }
    return null;
}

function toNumber(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function addDaysToDate(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function daysBetween(d1, d2) {
    const date1 = toDate(d1);
    const date2 = toDate(d2);
    if (!date1 || !date2) return null;
    return Math.round((date1 - date2) / (1000 * 60 * 60 * 24));
}

// Built-in function implementations
const FUNCTIONS = {
    ABS: (args) => { const v = toNumber(args[0]); return v != null ? Math.abs(v) : null; },
    ROUND: (args) => {
        const v = toNumber(args[0]);
        if (v == null) return null;
        const dp = toNumber(args[1]) ?? 0;
        return Number(v.toFixed(Math.max(0, Math.min(10, dp))));
    },
    CEIL: (args) => { const v = toNumber(args[0]); return v != null ? Math.ceil(v) : null; },
    FLOOR: (args) => { const v = toNumber(args[0]); return v != null ? Math.floor(v) : null; },
    MIN: (args) => {
        const nums = args.map(toNumber).filter(v => v != null);
        return nums.length > 0 ? Math.min(...nums) : null;
    },
    MAX: (args) => {
        const nums = args.map(toNumber).filter(v => v != null);
        return nums.length > 0 ? Math.max(...nums) : null;
    },
    SUM: (args) => {
        const nums = args.map(toNumber).filter(v => v != null);
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
    },
    AVG: (args) => {
        const nums = args.map(toNumber).filter(v => v != null);
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    },
    POWER: (args) => {
        const base = toNumber(args[0]);
        const exp = toNumber(args[1]);
        return base != null && exp != null ? Math.pow(base, exp) : null;
    },
    SQRT: (args) => {
        const v = toNumber(args[0]);
        return v != null && v >= 0 ? Math.sqrt(v) : null;
    },
    DATE_ADD: (args) => {
        const date = toDate(args[0]);
        const days = toNumber(args[1]);
        if (!date || days == null) return null;
        return addDaysToDate(date, days);
    },
    DATE_SUB: (args) => {
        const date = toDate(args[0]);
        const days = toNumber(args[1]);
        if (!date || days == null) return null;
        return addDaysToDate(date, -days);
    },
    DATE_DIFF: (args) => {
        return daysBetween(args[0], args[1]);
    },
    TODAY: () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    },
    IF: (args) => {
        const condition = args[0];
        // Truthy: non-zero number, non-null, non-empty string
        const isTruthy = condition != null && condition !== 0 && condition !== '' && condition !== false;
        return isTruthy ? (args[1] ?? null) : (args[2] ?? null);
    },
};

function evaluate(ast, context) {
    if (!ast) return null;

    switch (ast.type) {
        case 'NumberLiteral':
            return ast.value;

        case 'StringLiteral':
            return ast.value;

        case 'FieldRef': {
            const val = context.fields[ast.name];
            if (val === undefined || val === null) return null;
            // Try to parse as number if it looks numeric
            if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
            return val;
        }

        case 'UnaryOp': {
            const operand = evaluate(ast.operand, context);
            if (operand == null) return null;
            const num = toNumber(operand);
            return num != null ? -num : null;
        }

        case 'BinaryOp': {
            const left = evaluate(ast.left, context);
            const right = evaluate(ast.right, context);

            // Date arithmetic: Date + Number = Date, Date - Date = Number
            if (ast.op === T.PLUS && (isDateValue(left) || isDateValue(right))) {
                const date = isDateValue(left) ? toDate(left) : toDate(right);
                const num = isDateValue(left) ? toNumber(right) : toNumber(left);
                if (date && num != null) return addDaysToDate(date, num);
                return null;
            }
            if (ast.op === T.MINUS && isDateValue(left) && isDateValue(right)) {
                return daysBetween(left, right);
            }
            if (ast.op === T.MINUS && isDateValue(left)) {
                const num = toNumber(right);
                if (num != null) return addDaysToDate(toDate(left), -num);
                return null;
            }

            // Numeric operations
            const lNum = toNumber(left);
            const rNum = toNumber(right);
            if (lNum == null || rNum == null) return null;

            switch (ast.op) {
                case T.PLUS: return lNum + rNum;
                case T.MINUS: return lNum - rNum;
                case T.STAR: return lNum * rNum;
                case T.SLASH: return rNum !== 0 ? lNum / rNum : null;
                case T.PERCENT: return rNum !== 0 ? lNum % rNum : null;
                default: return null;
            }
        }

        case 'Comparison': {
            const left = evaluate(ast.left, context);
            const right = evaluate(ast.right, context);
            if (left == null || right == null) return 0;

            // Date comparison
            const ld = toDate(left);
            const rd = toDate(right);
            if (ld && rd) {
                const lt = ld.getTime();
                const rt = rd.getTime();
                switch (ast.op) {
                    case T.GT: return lt > rt ? 1 : 0;
                    case T.GTE: return lt >= rt ? 1 : 0;
                    case T.LT: return lt < rt ? 1 : 0;
                    case T.LTE: return lt <= rt ? 1 : 0;
                    case T.EQ: return lt === rt ? 1 : 0;
                    case T.NEQ: return lt !== rt ? 1 : 0;
                    default: return 0;
                }
            }

            // Numeric comparison
            const ln = toNumber(left);
            const rn = toNumber(right);
            if (ln != null && rn != null) {
                switch (ast.op) {
                    case T.GT: return ln > rn ? 1 : 0;
                    case T.GTE: return ln >= rn ? 1 : 0;
                    case T.LT: return ln < rn ? 1 : 0;
                    case T.LTE: return ln <= rn ? 1 : 0;
                    case T.EQ: return ln === rn ? 1 : 0;
                    case T.NEQ: return ln !== rn ? 1 : 0;
                    default: return 0;
                }
            }

            // String/mixed comparison (equality only)
            switch (ast.op) {
                case T.EQ: return String(left) === String(right) ? 1 : 0;
                case T.NEQ: return String(left) !== String(right) ? 1 : 0;
                default: return 0;
            }
        }

        case 'FunctionCall': {
            const fn = FUNCTIONS[ast.name];
            if (!fn) return null;
            // IF is special — evaluate args lazily for short-circuit
            if (ast.name === 'IF') {
                const cond = evaluate(ast.args[0], context);
                const isTruthy = cond != null && cond !== 0 && cond !== '' && cond !== false;
                return isTruthy
                    ? (ast.args[1] ? evaluate(ast.args[1], context) : null)
                    : (ast.args[2] ? evaluate(ast.args[2], context) : null);
            }
            // TODAY takes no args
            if (ast.name === 'TODAY') return fn([]);
            const evaluatedArgs = ast.args.map(arg => evaluate(arg, context));
            return fn(evaluatedArgs);
        }

        default:
            return null;
    }
}

// ── Context Builder ──────────────────────────────────────────────────────────

function buildContext(task, allCustomFields, extraValues = {}) {
    const fields = {};

    // Built-in task date fields
    fields['Due Date'] = task.due_date || null;
    fields['Start Date'] = task.start_date || null;
    fields['Created Date'] = task.created_at || null;

    // Custom field values (by name)
    for (const cf of allCustomFields) {
        if (cf.type === 'formula') continue; // formula values added separately
        const cfv = (task.custom_field_values || []).find(v => v.custom_field_id === cf.id);
        if (!cfv) { fields[cf.name] = null; continue; }

        switch (cf.type) {
            case 'number':
                fields[cf.name] = cfv.value_number != null ? Number(cfv.value_number) : null;
                break;
            case 'date':
                fields[cf.name] = cfv.value_date || null;
                break;
            case 'text':
            case 'textarea':
                fields[cf.name] = cfv.value_text || null;
                break;
            case 'single_select':
                fields[cf.name] = cfv.selected_option?.label || null;
                break;
            default:
                fields[cf.name] = null;
        }
    }

    // Merge in previously computed formula values
    Object.assign(fields, extraValues);

    return { fields };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract field names referenced in a formula string.
 */
export function extractFieldRefs(formulaString) {
    const refs = [];
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(formulaString)) !== null) {
        refs.push(match[1].trim());
    }
    return refs;
}

/**
 * Validate a formula string. Returns { valid: true } or { valid: false, error: string }.
 */
export function validateFormula(formulaString) {
    if (!formulaString || !formulaString.trim()) {
        return { valid: false, error: 'Formula is empty' };
    }
    try {
        const tokens = tokenize(formulaString);
        parse(tokens);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

/**
 * Evaluate a single formula for a task.
 * Returns the computed value or null on error.
 */
export function evaluateFormula(formulaString, task, customFields) {
    try {
        const context = buildContext(task, customFields);
        const tokens = tokenize(formulaString);
        const ast = parse(tokens);
        return evaluate(ast, context);
    } catch {
        return null;
    }
}

/**
 * Compute all formula fields for a task, handling inter-formula dependencies
 * via topological sort. Returns { fieldId: computedValue }.
 */
export function computeAllFormulas(task, customFields) {
    const formulaFields = customFields.filter(cf => cf.type === 'formula' && cf.config?.formula);
    if (formulaFields.length === 0) return {};

    // Build dependency graph: fieldName → field names it depends on
    const fieldByName = {};
    for (const cf of customFields) fieldByName[cf.name] = cf;

    // Topological sort (Kahn's algorithm)
    const sorted = [];
    const inDegree = {};
    const dependents = {}; // name → [names that depend on it]

    for (const ff of formulaFields) {
        inDegree[ff.name] = 0;
        dependents[ff.name] = dependents[ff.name] || [];
    }

    for (const ff of formulaFields) {
        const refs = extractFieldRefs(ff.config.formula);
        for (const ref of refs) {
            const dep = fieldByName[ref];
            if (dep && dep.type === 'formula' && dep.id !== ff.id) {
                inDegree[ff.name] = (inDegree[ff.name] || 0) + 1;
                dependents[dep.name] = dependents[dep.name] || [];
                dependents[dep.name].push(ff.name);
            }
        }
    }

    const queue = formulaFields.filter(ff => (inDegree[ff.name] || 0) === 0);
    while (queue.length > 0) {
        const ff = queue.shift();
        sorted.push(ff);
        for (const depName of (dependents[ff.name] || [])) {
            inDegree[depName]--;
            if (inDegree[depName] === 0) {
                const depField = formulaFields.find(f => f.name === depName);
                if (depField) queue.push(depField);
            }
        }
    }

    // If there are unsorted fields, they have circular dependencies — skip them
    const sortedSet = new Set(sorted.map(f => f.id));
    for (const ff of formulaFields) {
        if (!sortedSet.has(ff.id)) sorted.push(ff); // add at end, will evaluate with whatever's available
    }

    // Evaluate in order
    const results = {};
    const extraValues = {};

    for (const ff of sorted) {
        try {
            const context = buildContext(task, customFields, extraValues);
            const tokens = tokenize(ff.config.formula);
            const ast = parse(tokens);
            const value = evaluate(ast, context);
            results[ff.id] = value;
            extraValues[ff.name] = value;
        } catch {
            results[ff.id] = null;
        }
    }

    return results;
}

/**
 * Format a formula result for display.
 */
export function formatFormulaResult(value, config) {
    if (value == null) return '—';

    const resultType = config?.result_type || 'number';

    if (resultType === 'date') {
        const d = toDate(value);
        if (!d) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (typeof value === 'number') {
        const dp = config?.decimal_places ?? 2;
        return value.toFixed(dp);
    }

    return String(value);
}
