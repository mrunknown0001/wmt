<?php

namespace App\Support;

use App\Models\Department;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Server-side counterpart of resources/js/peopleScope.js.
 *
 * A People custom field may carry several scope rules. A person is in scope if
 * they match ANY rule (union — that is how coverage widens across teams); within
 * a rule the levels are ANDed. No rules means every active user.
 *
 * This exists because public forms cannot call the authenticated options
 * endpoint, and because a public submission must be checked against the scope
 * server-side — the browser is free to post whatever ids it likes.
 */
class PeopleScope
{
    /** Normalise either config shape into a list of rules with string ids. */
    public static function rules(?array $config): array
    {
        if (!$config) {
            return [];
        }

        $raw = isset($config['scopes']) && is_array($config['scopes'])
            ? $config['scopes']
            // Original single-rule shape, still stored on older fields.
            : [[
                'division_id' => $config['division_id'] ?? null,
                'department_id' => $config['department_id'] ?? null,
                'team_id' => $config['team_id'] ?? null,
            ]];

        return collect($raw)
            ->map(fn ($s) => [
                'division_id' => self::str($s['division_id'] ?? null),
                'department_id' => self::str($s['department_id'] ?? null),
                'team_id' => self::str($s['team_id'] ?? null),
            ])
            // A rule naming nothing would match everyone and defeat the scope.
            ->reject(fn ($s) => $s['division_id'] === '' && $s['department_id'] === '' && $s['team_id'] === '')
            ->values()
            ->all();
    }

    /**
     * Active users inside the scope, as [['id' => int, 'name' => string], ...].
     * Only id and name — a public form has no business seeing emails, positions
     * or the org structure.
     */
    public static function users(?array $config): Collection
    {
        $rules = self::rules($config);
        $departmentDivisions = Department::pluck('division_id', 'id');

        return User::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'department_id', 'team_id'])
            ->filter(function (User $u) use ($rules, $departmentDivisions) {
                if (empty($rules)) {
                    return true;
                }

                $divisionId = $u->department_id ? ($departmentDivisions[$u->department_id] ?? null) : null;

                foreach ($rules as $rule) {
                    if ($rule['division_id'] !== '' && self::str($divisionId) !== $rule['division_id']) {
                        continue;
                    }
                    if ($rule['department_id'] !== '' && self::str($u->department_id) !== $rule['department_id']) {
                        continue;
                    }
                    if ($rule['team_id'] !== '' && self::str($u->team_id) !== $rule['team_id']) {
                        continue;
                    }

                    return true;
                }

                return false;
            })
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])
            ->values();
    }

    /** The ids a submission is allowed to contain for this field. */
    public static function allowedIds(?array $config): array
    {
        return self::users($config)->pluck('id')->all();
    }

    private static function str($value): string
    {
        return $value === null || $value === '' ? '' : (string) $value;
    }
}
