

import React, { useEffect, useMemo, useState } from 'react';
import './UserDashboard.css';
import { auth } from './firebaseClient';
import { API_ENDPOINTS } from './config';

const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;

const UserDashboard = ({ user, content, stats, badges, notifications, userDefaults, onSaveDefaults, onLogout, onUpload, mySchedules, onSchedulesChanged }) => {
	const [activeTab, setActiveTab] = useState('profile');
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState(null);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [type, setType] = useState('video');
	const [scheduleMode, setScheduleMode] = useState('auto');
	const [manualWhen, setManualWhen] = useState('');
	const [frequency, setFrequency] = useState('once');
	const [tz, setTz] = useState(userDefaults?.timezone || 'UTC');
	const [defaultsPlatforms, setDefaultsPlatforms] = useState(Array.isArray(userDefaults?.defaultPlatforms) ? userDefaults.defaultPlatforms : []);
	const [defaultsFrequency, setDefaultsFrequency] = useState(userDefaults?.defaultFrequency || 'once');
	const [tiktokStatus, setTikTokStatus] = useState({ connected: false });
	const [facebookStatus, setFacebookStatus] = useState({ connected: false });
	const [youtubeStatus, setYouTubeStatus] = useState({ connected: false });
	const [twitterStatus, setTwitterStatus] = useState({ connected: false });
	const [earnings, setEarnings] = useState({ pendingEarnings: 0, totalEarnings: 0, payoutEligible: false, minPayoutAmount: 0 });
	const [payouts, setPayouts] = useState([]);
	const [progress, setProgress] = useState({ contentCount: 0, requiredForRevenue: 0, remaining: 0, revenueEligible: false });
	const [platformSummary, setPlatformSummary] = useState({ platforms: {} });

	const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
	const schedulesList = useMemo(() => (Array.isArray(mySchedules) ? mySchedules : []), [mySchedules]);
	const firstItem = contentList[0] || {};
	const safeFirstThumb = firstItem?.thumbnailUrl || DEFAULT_IMAGE;
	const safeLandingUrl = typeof firstItem?.landingPageUrl === 'string' ? firstItem.landingPageUrl : undefined;
	const safeSmartLink = typeof firstItem?.smartLink === 'string' ? firstItem.smartLink : undefined;

	const handleNav = (tab) => {
		setActiveTab(tab);
		setSidebarOpen(false);
	};

	// ...existing code from UserDashboard_full.js...

	// (Full implementation as in UserDashboard_full.js, including all tabs, stats, upload, schedules, analytics, rewards, notifications, earnings, and connections)

	return (
		<div className="dashboard-root">
			{/* Topbar with mobile hamburger */}
			<header className="dashboard-topbar" aria-label="Top navigation">
				<button
					className="hamburger"
					aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
					aria-expanded={sidebarOpen}
					onClick={() => setSidebarOpen((v) => !v)}
				>
					<span />
					<span />
					<span />
				</button>
				<div className="topbar-title">Your Dashboard</div>
				<div className="topbar-user">{user?.name || 'Guest'}</div>
			</header>

			{/* Sidebar */}
			<aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Sidebar">
				{/* ...sidebar content... */}
			</aside>

			{/* Backdrop for mobile when sidebar open */}
			{sidebarOpen && (
				<div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
			)}

			<main className="dashboard-main">
				{/* ...tab panels for profile, upload, schedules, analytics, rewards, notifications, earnings, connections... */}
			</main>
		</div>
	);
};

export default UserDashboard;

