/**
 * Scoping rules for the People custom field.
 *
 * A field may carry several scope rules. A person is offered if they match ANY
 * of them, which is how coverage widens across teams, departments and divisions
 * — "Payroll team OR the whole Finance department" rather than the intersection,
 * which would be empty.
 *
 * Within a single rule the three levels are ANDed: division + department + team
 * narrows to people in all three.
 */

const str = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

/** A rule that names nothing would match everyone and defeat the point. */
export function scopeIsEmpty(scope) {
    return !scope || (!str(scope.division_id) && !str(scope.department_id) && !str(scope.team_id));
}

/**
 * Config -> array of scope rules, ids normalised to strings.
 *
 * Accepts both shapes: the current `{ scopes: [...] }` and the original single
 * `{ division_id, department_id, team_id }`, so fields defined before multiple
 * rules existed keep working untouched.
 */
export function normalizeScopes(config) {
    if (!config) return [];

    const raw = Array.isArray(config.scopes)
        ? config.scopes
        : [{ division_id: config.division_id, department_id: config.department_id, team_id: config.team_id }];

    return raw
        .filter((s) => !scopeIsEmpty(s))
        .map((s) => ({
            division_id: str(s.division_id),
            department_id: str(s.department_id),
            team_id: str(s.team_id),
        }));
}

/** True when the config actually narrows anything. */
export function hasPeopleScope(config) {
    return normalizeScopes(config).length > 0;
}

/** A user matches a rule when every level named by that rule agrees. */
export function userMatchesScope(user, scope) {
    if (scope.division_id && str(user.division_id) !== scope.division_id) return false;
    if (scope.department_id && str(user.department_id) !== scope.department_id) return false;
    if (scope.team_id && str(user.team_id) !== scope.team_id) return false;
    return true;
}

/** Users covered by any rule. Unscoped configs return everyone. */
export function filterUsersByScopes(users, scopes) {
    if (!scopes || scopes.length === 0) return users || [];
    return (users || []).filter((u) => scopes.some((s) => userMatchesScope(u, s)));
}

/** "Finance · Payroll" for one rule — the levels it actually names. */
export function describeScope(scope, data) {
    if (!data) return '';

    const parts = [
        data.divisions?.find((d) => str(d.id) === scope.division_id)?.name,
        data.departments?.find((d) => str(d.id) === scope.department_id)?.name,
        data.teams?.find((t) => str(t.id) === scope.team_id)?.name,
    ].filter(Boolean);

    return parts.join(' · ');
}

/** All rules, joined for display: "Finance · Payroll, Operations". */
export function describeScopes(scopes, data) {
    return (scopes || [])
        .map((s) => describeScope(s, data))
        .filter(Boolean)
        .join(', ');
}
