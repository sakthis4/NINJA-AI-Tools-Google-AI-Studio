import React, { useState } from 'react';
import { View } from '../App';
import { useAppContext } from '../hooks/useAppContext';
import { ToolsIcon, DashboardIcon, AdminIcon, HelpIcon, MenuIcon, XIcon, ChevronLeftIcon, CodeIcon } from './icons/Icons';
import Modal from './Modal';
import { HELP_CONTENT } from '../constants';

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
}

// Moved NavLink outside the main component for performance and best practices.
const NavLink: React.FC<{ 
  id: View, 
  label: string, 
  icon: React.ElementType, 
  isCollapsed: boolean, 
  isActive: boolean, 
  onClick: () => void 
}> = ({ id, label, icon: Icon, isCollapsed, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${
        isActive
          ? 'bg-sky-500/20 text-sky-500'
          : 'text-slate-500 dark:text-slate-400 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400'
      } ${isCollapsed ? 'justify-center' : ''}`}
    >
      <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-sky-500' : 'text-slate-400 group-hover:text-sky-500'}`} />
      {!isCollapsed && <span className="ml-3">{label}</span>}
    </button>
  );

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const { currentUser } = useAppContext();
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'tools', label: 'Tools', icon: ToolsIcon, visible: true },
    { id: 'dashboard', label: 'Usage Dashboard', icon: DashboardIcon, visible: true },
    { id: 'api', label: 'API Integration', icon: CodeIcon, visible: true },
    { id: 'admin', label: 'Admin Panel', icon: AdminIcon, visible: currentUser?.role === 'Admin' },
  ];

  const sidebarContent = (
    <>
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-5`}>
        {!isCollapsed && <h1 className="text-xl font-bold text-slate-800 dark:text-white">S4-AI</h1>}
      </div>
      <nav className="flex-1 px-2 space-y-2">
        {navItems.filter(item => item.visible).map(item => (
          <NavLink 
            key={item.id} 
            id={item.id as View} 
            label={item.label} 
            icon={item.icon} 
            isCollapsed={isCollapsed}
            isActive={activeView === item.id}
            onClick={() => {
                setActiveView(item.id as View);
                setMobileMenuOpen(false);
            }} 
          />
        ))}
      </nav>
      <div className="px-2 pb-4">
        <button
          onClick={() => setHelpOpen(true)}
          className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 group text-slate-500 dark:text-slate-400 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 ${isCollapsed ? 'justify-center' : ''}`}
        >
          <HelpIcon className="h-5 w-5 text-slate-400 group-hover:text-sky-500" />
          {!isCollapsed && <span className="ml-3">Usage Instructions</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-4 fixed top-4 left-4 z-20 bg-white dark:bg-slate-800 rounded-full shadow-lg">
        <MenuIcon className="h-6 w-6 text-slate-800 dark:text-white" />
      </button>

      {/* Mobile Sidebar */}
      <div className={`fixed inset-0 z-30 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:hidden`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
        <div className="relative flex flex-col w-64 h-full bg-slate-50 dark:bg-slate-800 shadow-xl">
          <button onClick={() => setMobileMenuOpen(false)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400">
            <XIcon className="h-6 w-6" />
          </button>
          {sidebarContent}
        </div>
      </div>
      
      {/* Desktop Sidebar */}
      <aside className={`relative hidden md:flex flex-col bg-slate-50 dark:bg-slate-800 shadow-lg transition-all duration-300 border-r border-slate-200 dark:border-slate-700 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3 top-10 z-10 bg-white dark:bg-slate-700 p-1.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600">
          <ChevronLeftIcon className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
        {sidebarContent}
      </aside>

      <Modal isOpen={isHelpOpen} onClose={() => setHelpOpen(false)} title={HELP_CONTENT.title}>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          {HELP_CONTENT.sections.map(section => (
            <div key={section.title}>
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{section.title}</h4>
              <p>{section.content}</p>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}