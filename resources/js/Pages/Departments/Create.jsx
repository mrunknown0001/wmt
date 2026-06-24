import { Link, useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';

export default function Create() {
    const { divisions, users } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        division_id: '',
        head_id: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/departments');
    };

    return (
        <AuthenticatedLayout title="Create Department">
            <div className="max-w-2xl">
                <div className="flex items-center gap-4 mb-4">
                    <Link href="/departments" className="text-gray-500 hover:text-gray-700">&larr; Back</Link>
                    <h1 className="text-2xl font-semibold text-gray-800">Create Department</h1>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                        <input
                            id="name"
                            type="text"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                            id="description"
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            rows={3}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
                    </div>

                    <div>
                        <label htmlFor="division_id" className="block text-sm font-medium text-gray-700">Division</label>
                        <select
                            id="division_id"
                            value={data.division_id}
                            onChange={(e) => setData('division_id', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="">— Select Division —</option>
                            {divisions.map((div) => (
                                <option key={div.id} value={div.id}>{div.name}</option>
                            ))}
                        </select>
                        {errors.division_id && <p className="mt-1 text-sm text-red-600">{errors.division_id}</p>}
                    </div>

                    <div>
                        <label htmlFor="head_id" className="block text-sm font-medium text-gray-700">Department Head</label>
                        <select
                            id="head_id"
                            value={data.head_id}
                            onChange={(e) => setData('head_id', e.target.value || '')}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="">— None —</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                        </select>
                        {errors.head_id && <p className="mt-1 text-sm text-red-600">{errors.head_id}</p>}
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Link href="/departments" className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                            Cancel
                        </Link>
                        <button type="submit" disabled={processing} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {processing ? 'Creating...' : 'Create Department'}
                        </button>
                    </div>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
