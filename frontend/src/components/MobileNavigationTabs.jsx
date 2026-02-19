import { useState } from "react";
import { UsersIcon, GlobeIcon, ClockIcon, BellIcon, UserPlusIcon } from "lucide-react";

const MobileNavigationTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    {
      id: 'friends',
      label: 'Your Friends',
      icon: UsersIcon,
      count: null
    },
    {
      id: 'languages',
      label: 'Supported Languages',
      icon: GlobeIcon,
      count: null
    },
    {
      id: 'recently',
      label: 'Recently Added',
      icon: ClockIcon,
      count: null
    },
    {
      id: 'requests',
      label: 'Friend Requests',
      icon: BellIcon,
      count: null
    },
    {
      id: 'participants',
      label: 'New Participants',
      icon: UserPlusIcon,
      count: null
    }
  ];

  return (
    <div className="lg:hidden bg-base-100 border-b border-base-300 sticky top-0 z-40 w-full overflow-x-hidden">
      <div className="flex overflow-x-auto scrollbar-hide px-4 py-3 gap-2 min-w-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all duration-200 ${
                isActive 
                  ? 'bg-primary text-primary-content' 
                  : 'bg-base-200 text-base-content hover:bg-base-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-primary-content/20 text-primary-content' : 'bg-base-300 text-base-content'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileNavigationTabs;
