import React, { useState } from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { User, Role } from '../types';
import Modal from '../components/Modal';
import { TrashIcon, PencilIcon } from '../components/icons/Icons';

const UserForm = ({ user, onSave, onCancel }: { user?: User | null, onSave: (data: any) => void, onCancel: () => void }) => {
    const [email, setEmail] = useState(user?.email || '');
    const [role, setRole] = useState(user?.role || Role.User);
    const [tokenCap, setTokenCap] = useState(user?.tokenCap || 50000);
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState<'active' | 'inactive'>(user?.status || 'active');
    const [canUseProModel, setCanUseProModel] = useState(user?.canUseProModel || false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave: any = { email, role, tokenCap, status, canUseProModel };
        if (!user || (user && password)) { 
            if (!password && !user) {
                 console.error("Password is required for new users.");
                 return;
            }
            if (password) dataToSave.password = password;
        }
        onSave(dataToSave);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!!user} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required={!user} 
                    placeholder={user ? "Leave blank to keep current password" : "Enter password"}
                    className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" 
                />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as Role)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md">
                    <option>{Role.User}</option>
                    <option>{Role.Admin}</option>
                </select>
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Token Cap</label>
                <input type="number" value={tokenCap} onChange={e => setTokenCap(Number(e.target.value))} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>
            <div className="flex items-center">
                <input id="pro-model-access" type="checkbox" checked={canUseProModel} onChange={e => setCanUseProModel(e.target.checked)} className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:bg-gray-600 dark:border-gray-500" />
                <label htmlFor="pro-model-access" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Allow Pro Model Access</label>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700">Save</button>
            </div>
        </form>
    );
};

export default function AdminPanel() {
  const { users, addUser, deleteUser, updateUser, usageLogs } = useAppContext();
  const [isAddUserModalOpen, setAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setEditUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditUserModalOpen(true);
  };
  
  return (
    <div className="animate-fade-in space-y-10">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Admin Panel</h2>

      {/* User Management Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white">User Management</h3>
          <button
              onClick={() => setAddUserModalOpen(true)}
              className="px-4 py-2 bg-primary-500 text-white font-semibold rounded-lg hover:bg-primary-600"
          >
              Add New User
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Pro Access</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Token Usage</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{user.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{user.canUseProModel ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {user.tokensUsed.toLocaleString()} / {user.tokenCap.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Date(user.lastLogin).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button onClick={() => handleEditClick(user)} className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-200 p-1"><PencilIcon className="h-5 w-5"/></button>
                      <button onClick={() => deleteUser(user.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 p-1"><TrashIcon className="h-5 w-5"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global Usage History Section */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Global Usage History</h3>
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tool</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Model Used</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date &amp; Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Prompt Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Response Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Tokens</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {usageLogs.map(log => {
                const user = users.find(u => u.id === log.userId);
                return (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user?.email || `User ID: ${log.userId}`}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{log.toolName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        <code className="text-xs bg-gray-200 dark:bg-gray-600 p-1 rounded">{log.modelName}</code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{log.promptTokens.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{log.responseTokens.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">{(log.promptTokens + log.responseTokens).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

        <Modal isOpen={isAddUserModalOpen} onClose={() => setAddUserModalOpen(false)} title="Add New User">
            <UserForm 
                onSave={({email, role, tokenCap, password, status, canUseProModel}) => {
                    addUser(email, role, tokenCap, password, status); // canUseProModel is handled inside addUser
                    setAddUserModalOpen(false);
                }} 
                onCancel={() => setAddUserModalOpen(false)}
            />
        </Modal>

        <Modal isOpen={isEditUserModalOpen} onClose={() => setEditUserModalOpen(false)} title="Edit User">
            {selectedUser && <UserForm
                user={selectedUser}
                onSave={({ role, tokenCap, password, status, canUseProModel }) => {
                    const updatedData: Partial<User> = { role, tokenCap, status, canUseProModel };
                    if (password) {
                        updatedData.password = password;
                    }
                    updateUser({ ...selectedUser, ...updatedData });
                    setEditUserModalOpen(false);
                }} 
                onCancel={() => setEditUserModalOpen(false)}
            />}
        </Modal>
    </div>
  );
}
