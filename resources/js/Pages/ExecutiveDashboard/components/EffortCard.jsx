import Card from '../../../Components/Card';
import { formatMinutes } from '../../../utils';

/**
 * Effort logged across this part of the org, and how the estimates compared.
 *
 * Volume is what the rest of this dashboard measures — tasks raised, finished,
 * overdue. This is the other axis: how much time the work actually took.
 *
 * The blind spot is given the same prominence as the ratio on purpose. An
 * accuracy figure drawn from a handful of tasks can steer a decision at this
 * level far more than it could on one project, and a reader who cannot see how
 * much of the picture is missing will take it for the whole.
 */
export default function EffortCard({ effort }) {
    if (!effort) return null;

    const { total_minutes: total = 0, entries = 0, running = 0, accuracy = {} } = effort;
    const ratio = accuracy.median_ratio;
    const blindSpot = accuracy.estimated_not_logged ?? 0;

    // Amber once the unmeasured tasks outnumber the measured ones: past that
    // point the ratio describes the exception, not the rule.
    const ratioTone = ratio == null
        ? 'text-gray-400 dark:text-gray-500'
        : ratio > 1.1
            ? 'text-red-600 dark:text-red-400'
            : ratio < 0.9
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400';

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Effort logged</h3>

            <div className="grid grid-cols-3 gap-4">
                <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time logged</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {total > 0 ? formatMinutes(total) : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {entries} {entries === 1 ? 'entry' : 'entries'}
                    </p>
                </div>

                <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estimate vs actual</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${ratioTone}`}>
                        {ratio == null ? '—' : `${ratio.toFixed(2)}×`}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {accuracy.count > 0
                            ? `median across ${accuracy.count} ${accuracy.count === 1 ? 'task' : 'tasks'}`
                            : 'nothing to compare'}
                    </p>
                </div>

                <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Not measured</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${
                        blindSpot > (accuracy.count ?? 0)
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-900 dark:text-gray-100'
                    }`}>
                        {blindSpot}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">estimated, never logged</p>
                </div>
            </div>

            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Effort is dated by the day the work happened, not the day it was entered.
                {running > 0 && (
                    <> {running} {running === 1 ? 'timer is' : 'timers are'} still running and
                    {running === 1 ? ' is' : ' are'} not in the total.</>
                )}
                {blindSpot > 0 && (
                    <> The ratio covers only finished work carrying both an estimate and some logged
                    time; {blindSpot} finished {blindSpot === 1 ? 'task was' : 'tasks were'} estimated
                    but never logged against
                    {blindSpot > (accuracy.count ?? 0) ? ', which is more than it measures' : ''}.</>
                )}
            </p>
        </Card>
    );
}
