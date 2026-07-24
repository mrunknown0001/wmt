import MetricCards from '../components/MetricCards';
import MemberTable from '../components/MemberTable';
import ActivityFeed from '../../../Components/Dashboard/ActivityFeed';
import DonutChart from '../../../Components/Dashboard/DonutChart';
import BarChart from '../../../Components/Dashboard/BarChart';

export default function TeamDetail({ metrics, members, distributions, activityFeed, entity }) {
    return (
        <div className="space-y-6">
            <MetricCards data={metrics} scope="team" scopeId={entity?.id} />

            <MemberTable members={members} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DonutChart data={distributions?.byStatus} title="Tasks by Status" />
                <BarChart data={distributions?.byPriority} title="Tasks by Priority" />
            </div>

            <ActivityFeed activities={activityFeed} />
        </div>
    );
}
