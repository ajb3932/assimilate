import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Database, HardDrive, Clock, FileText, TrendingUp, Activity, Shield, AlertTriangle, CheckCircle, XCircle, Info, Settings } from 'lucide-react';

const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

const formatBytes = (bytes) => {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
};

const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const getHealthIcon = (status) => {
  switch (status) {
    case 'healthy': return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    case 'critical': return <XCircle className="w-5 h-5 text-red-500" />;
    default: return <Shield className="w-5 h-5 text-gray-500" />;
  }
};

function AssimilateDashboard() {
  const [darkMode, setDarkMode] = useState(false);
  const [stats, setStats] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [archives, setArchives] = useState([]);
  const [trends, setTrends] = useState([]);
  const [borgmaticConfig, setBorgmaticConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [archiveFilter, setArchiveFilter] = useState({
    locationType: 'all',
    timeRange: 'all'
  });

  useEffect(() => {
    // Check for system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [statsRes, reposRes, archivesRes, trendsRes, configRes] = await Promise.all([
        fetch(`${API_BASE_URL}/stats`),
        fetch(`${API_BASE_URL}/repositories`),
        fetch(`${API_BASE_URL}/archives?limit=20`),
        fetch(`${API_BASE_URL}/trends?days=14`),
        fetch(`${API_BASE_URL}/borgmatic-config`)
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      if (!reposRes.ok) throw new Error('Failed to fetch repositories');
      if (!archivesRes.ok) throw new Error('Failed to fetch archives');
      if (!trendsRes.ok) throw new Error('Failed to fetch trends');

      const [statsData, reposData, archivesData, trendsData, configData] = await Promise.all([
        statsRes.json(),
        reposRes.json(),
        archivesRes.json(),
        trendsRes.json(),
        configRes.json()
      ]);

      setStats(statsData);
      setRepositories(reposData);
      setArchives(archivesData);
      setTrends(trendsData);
      setBorgmaticConfig(configData);
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const getFilteredArchives = () => {
    let filtered = [...archives];

    // Filter by location type
    if (archiveFilter.locationType !== 'all') {
      filtered = filtered.filter(archive => archive.location_type === archiveFilter.locationType);
    }

    // Filter by time range
    if (archiveFilter.timeRange !== 'all') {
      const now = new Date();
      let cutoffDate;

      switch (archiveFilter.timeRange) {
        case '24h':
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = null;
      }

      if (cutoffDate) {
        filtered = filtered.filter(archive => new Date(archive.created_at) >= cutoffDate);
      }
    }

    return filtered;
  };

  if (isLoading && !stats) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-black' : 'bg-gray-100'}`}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className={`w-12 h-12 border-4 ${darkMode ? 'border-green-500 border-t-transparent' : 'border-blue-600 border-t-transparent'} rounded-full`}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-black' : 'bg-gray-100'}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-6 rounded-lg ${darkMode ? 'bg-gray-900 text-green-400 border border-green-700' : 'bg-white text-gray-900'} shadow-lg max-w-md`}
        >
          <XCircle className={`w-12 h-12 ${darkMode ? 'text-red-400' : 'text-red-500'} mx-auto mb-4`} />
          <h2 className={`text-xl font-bold text-center mb-2 ${darkMode ? 'text-green-400' : ''}`}>Connection Error</h2>
          <p className={`text-center ${darkMode ? 'text-green-300' : 'text-gray-600'} mb-4`}>{error}</p>
          <button
            onClick={loadData}
            className={`w-full px-4 py-2 ${darkMode ? 'bg-green-700 hover:bg-green-600 text-black' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded-lg transition-colors font-semibold`}
          >
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  const pieData = repositories.map(repo => ({
    name: `${repo.name} (${repo.location_type})`,
    value: repo.archive_count,
    color: repo.location_type === 'local' ? '#3B82F6' : '#10B981'
  }));

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode ? 'bg-black text-green-400' : 'bg-gray-100 text-gray-900'
    }`}>
      {/* Header */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`${darkMode ? 'bg-gray-900 border-green-700' : 'bg-white border-gray-300'} border-b sticky top-0 z-50`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Shield className={`w-8 h-8 ${darkMode ? 'text-green-500' : 'text-green-600'}`} />
              <h1 className="text-xl font-bold">Assimilate</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`text-sm ${darkMode ? 'text-green-300' : 'text-gray-600'}`}>
                Last updated: {new Date().toLocaleString()}
              </span>
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'bg-gray-800 hover:bg-gray-700 border border-green-700' : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className={`${darkMode ? 'bg-gray-900' : 'bg-white'} border-b ${darkMode ? 'border-green-700' : 'border-gray-300'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'overview', name: 'Collective Status', icon: Activity },
              { id: 'archives', name: 'Archive History', icon: FileText },
              { id: 'config', name: 'Borgmatic Config', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? `${darkMode ? 'border-green-500 text-green-400' : 'border-green-600 text-green-600'}`
                    : `border-transparent ${darkMode ? 'text-green-300 hover:text-green-200' : 'text-gray-500 hover:text-gray-700'}`
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && stats && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { title: 'Total Archives', value: stats.total_archives, icon: Database, color: 'blue' },
                  { title: 'Total Size', value: formatBytes(stats.total_size), icon: HardDrive, color: 'green' },
                  { title: 'Avg Duration', value: formatDuration(stats.avg_duration), icon: Clock, color: 'purple' },
                  { title: 'Repositories', value: stats.total_repositories, icon: Shield, color: 'orange' }
                ].map((stat, index) => (
                  <motion.div
                    key={stat.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={`${darkMode ? 'bg-gray-900 hover:bg-gray-800 border border-green-700' : 'bg-white hover:bg-gray-50'} rounded-lg shadow-lg p-6 cursor-pointer transition-colors`}
                    onClick={() => setActiveTab('archives')}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-gray-600'}`}>{stat.title}</p>
                        <motion.p
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
                          className={`text-2xl font-bold ${darkMode ? 'text-green-400' : ''}`}
                        >
                          {stat.value}
                        </motion.p>
                      </div>
                      <div className={`p-3 rounded-full ${darkMode ? 'bg-green-900/30' : `bg-${stat.color}-100`}`}>
                        <stat.icon className={`w-6 h-6 ${darkMode ? 'text-green-500' : `text-${stat.color}-600`}`} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Repository Health Status */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className={`text-lg font-semibold flex items-center ${darkMode ? 'text-green-400' : ''}`}>
                    <Shield className={`w-5 h-5 mr-2 ${darkMode ? 'text-green-500' : ''}`} />
                    Repository Health Status
                  </h3>
                </div>
                <div className={`mb-4 p-4 rounded-lg ${darkMode ? 'bg-gray-800 border border-green-800' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className="flex items-start">
                    <Info className={`w-5 h-5 mr-2 mt-0.5 flex-shrink-0 ${darkMode ? 'text-green-500' : 'text-blue-600'}`} />
                    <div className="text-sm">
                      <p className={`font-semibold mb-2 ${darkMode ? 'text-green-400' : 'text-blue-900'}`}>Health Status Definitions:</p>
                      <ul className={`space-y-1 ${darkMode ? 'text-green-300' : 'text-blue-800'}`}>
                        <li className="flex items-center">
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                          <span><strong>Healthy:</strong> Backup completed within the last 24 hours</span>
                        </li>
                        <li className="flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                          <span><strong>Warning:</strong> Last backup was 24-48 hours ago</span>
                        </li>
                        <li className="flex items-center">
                          <XCircle className="w-4 h-4 mr-2 text-red-500" />
                          <span><strong>Critical:</strong> No backup for more than 48 hours</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {repositories.map((repo, index) => (
                    <motion.div
                      key={repo.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                        repo.health_status === 'healthy' ? 'border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' :
                        repo.health_status === 'warning' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30' :
                        'border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                      }`}
                      onClick={() => setActiveTab('archives')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{repo.name}</h4>
                        {getHealthIcon(repo.health_status)}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Type: {repo.location_type}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Archives: {repo.archive_count}
                      </p>
                      {repo.size_on_disk_bytes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Size: {formatBytes(repo.size_on_disk_bytes)}
                        </p>
                      )}
                      {repo.hours_since_backup && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Last: {Math.round(repo.hours_since_backup)}h ago
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Charts */}
              {pieData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Repository Distribution */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
                  >
                    <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-green-400' : ''}`}>Archive Distribution</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={1000}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex justify-center space-x-6">
                      <div className="flex items-center">
                        <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
                        <span className="text-sm">Local Repositories</span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
                        <span className="text-sm">Remote Repositories</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Recent Archive Sizes */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
                  >
                    <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-green-400' : ''}`}>Recent Archive Sizes</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={archives.slice(0, 8).reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                          <XAxis
                            dataKey="archive_name"
                            tick={{ fontSize: 9 }}
                            stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                            tickFormatter={(value, index) => {
                              const archive = archives.slice(0, 8).reverse()[index];
                              if (archive) {
                                const date = new Date(archive.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                const repoType = archive.location_type === 'local' ? 'Local' : 'Remote';
                                return `${date}-${repoType}`;
                              }
                              return value;
                            }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis
                            stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                            tickFormatter={(value) => formatBytes(value)}
                          />
                          <Tooltip
                            formatter={(value) => [formatBytes(value), 'Size']}
                            labelFormatter={(label, payload) => {
                              if (payload && payload[0]) {
                                const archive = payload[0].payload;
                                return `${archive.repository_name} - ${new Date(archive.created_at).toLocaleDateString()}`;
                              }
                              return label;
                            }}
                          />
                          <Bar dataKey="original_size_bytes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Backup Size Trends */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
              >
                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-green-400' : ''}`}>Backup Size Trends (Last 14 Days)</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                      <XAxis
                        dataKey="date"
                        stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis
                        stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                        tickFormatter={(value) => formatBytes(value * 1024 * 1024)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                          border: `1px solid ${darkMode ? '#374151' : '#E5E7EB'}`,
                          borderRadius: '8px'
                        }}
                        formatter={(value, name) => [formatBytes(value * 1024 * 1024), name]}
                      />
                      <Line
                        type="monotone"
                        dataKey="localSize"
                        stroke="#3B82F6"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Local (MB)"
                        animationDuration={2000}
                      />
                      <Line
                        type="monotone"
                        dataKey="remoteSize"
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Remote (MB)"
                        animationDuration={2000}
                        animationDelay={500}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'archives' && (
            <motion.div
              key="archives"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Filters */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
              >
                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-green-400' : ''}`}>Filters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Repository Type</label>
                    <select
                      value={archiveFilter.locationType}
                      onChange={(e) => setArchiveFilter({...archiveFilter, locationType: e.target.value})}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        darkMode
                          ? 'bg-gray-800 border-green-700 text-green-400 focus:ring-green-500'
                          : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                      }`}
                    >
                      <option value="all">All Repositories</option>
                      <option value="local">Local Only</option>
                      <option value="remote">Remote Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Time Range</label>
                    <select
                      value={archiveFilter.timeRange}
                      onChange={(e) => setArchiveFilter({...archiveFilter, timeRange: e.target.value})}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        darkMode
                          ? 'bg-gray-800 border-green-700 text-green-400 focus:ring-green-500'
                          : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                      }`}
                    >
                      <option value="all">All Time</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                    </select>
                  </div>
                </div>
                <div className={`mt-4 text-sm ${darkMode ? 'text-green-300' : 'text-gray-600'}`}>
                  Showing {getFilteredArchives().length} of {archives.length} archives
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg overflow-hidden`}
              >
                <div className={`px-6 py-4 border-b ${darkMode ? 'border-green-700' : 'border-gray-200'}`}>
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-green-400' : ''}`}>Archive History</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className={`${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Archive</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Repository</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Size</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Files</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Duration</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-green-700' : 'divide-gray-200'}`}>
                      {getFilteredArchives().map((archive, index) => (
                        <motion.tr
                          key={archive.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className={`${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} transition-colors`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                            {archive.archive_name.split('-').slice(-3).join('-')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              archive.location_type === 'local'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            }`}>
                              {archive.repository_name} ({archive.location_type})
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {new Date(archive.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {formatBytes(archive.original_size_bytes)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {archive.number_of_files?.toLocaleString() || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {formatDuration(archive.duration_seconds)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'config' && borgmaticConfig && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className={`${darkMode ? 'bg-gray-900 border border-green-700' : 'bg-white'} rounded-lg shadow-lg p-6`}
              >
                <h3 className={`text-lg font-semibold mb-4 flex items-center ${darkMode ? 'text-green-400' : ''}`}>
                  <Settings className={`w-5 h-5 mr-2 ${darkMode ? 'text-green-500' : ''}`} />
                  Borgmatic Configuration
                </h3>

                {borgmaticConfig.error && (
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                    <p className={`${darkMode ? 'text-red-400' : 'text-red-800'}`}>{borgmaticConfig.error}</p>
                  </div>
                )}

                {borgmaticConfig.configs && borgmaticConfig.configs.length > 0 && (
                  <div className="space-y-6">
                    {borgmaticConfig.configs.map((configFile, index) => (
                      <motion.div
                        key={configFile.filename}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800 border border-green-800' : 'bg-gray-50 border border-gray-200'}`}
                      >
                        <h4 className={`text-md font-semibold mb-3 ${darkMode ? 'text-green-400' : 'text-gray-900'}`}>
                          {configFile.filename}
                        </h4>

                        {configFile.error ? (
                          <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{configFile.error}</p>
                        ) : (
                          <div className="space-y-4">
                            {/* Retention Policy */}
                            {(configFile.config.keep_daily || configFile.config.keep_weekly || configFile.config.keep_monthly || configFile.config.keep_yearly) && (
                              <div>
                                <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-green-300' : 'text-gray-700'}`}>Retention Policy:</p>
                                <div className={`flex flex-wrap gap-3 text-sm ${darkMode ? 'text-green-200' : 'text-gray-600'}`}>
                                  {configFile.config.keep_daily && <span>Daily: {configFile.config.keep_daily}</span>}
                                  {configFile.config.keep_weekly && <span>Weekly: {configFile.config.keep_weekly}</span>}
                                  {configFile.config.keep_monthly && <span>Monthly: {configFile.config.keep_monthly}</span>}
                                  {configFile.config.keep_yearly && <span>Yearly: {configFile.config.keep_yearly}</span>}
                                </div>
                              </div>
                            )}

                            {/* Repositories */}
                            {configFile.config.repositories && configFile.config.repositories.length > 0 && (
                              <div>
                                <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-green-300' : 'text-gray-700'}`}>Repositories:</p>
                                <div className="space-y-2">
                                  {configFile.config.repositories.map((repo, idx) => {
                                    if (typeof repo === 'object' && repo.path) {
                                      return (
                                        <div key={idx} className={`text-sm ${darkMode ? 'text-green-200' : 'text-gray-600'}`}>
                                          <span className="font-semibold">{repo.label || 'Repository'}:</span> {repo.path}
                                        </div>
                                      );
                                    } else if (typeof repo === 'string') {
                                      return (
                                        <div key={idx} className={`text-sm ${darkMode ? 'text-green-200' : 'text-gray-600'}`}>
                                          {repo}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Source Directories */}
                            {configFile.config.source_directories && configFile.config.source_directories.length > 0 && (
                              <div>
                                <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-green-300' : 'text-gray-700'}`}>Source Directories:</p>
                                <div className="space-y-1">
                                  {configFile.config.source_directories.map((dir, idx) => (
                                    <div key={idx} className={`text-sm ${darkMode ? 'text-green-200' : 'text-gray-600'}`}>
                                      {dir}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Encryption */}
                            {configFile.config.encryption_passphrase && (
                              <div>
                                <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-green-300' : 'text-gray-700'}`}>Encryption:</p>
                                <p className={`text-sm ${darkMode ? 'text-green-200' : 'text-gray-600'}`}>Enabled (passphrase set)</p>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default AssimilateDashboard;