import React, { useState, useCallback, useRef } from 'react';
import { Layout, Menu, Typography, Avatar, Dropdown } from 'antd';
import {
  TeamOutlined, DollarOutlined, CalculatorOutlined,
  LogoutOutlined, ScheduleOutlined,
  UserOutlined, SettingOutlined, SafetyCertificateOutlined, PercentageOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <CalculatorOutlined />, label: '数据总览' },
  { key: '/employees', icon: <TeamOutlined />, label: '员工花名册' },
  { key: '/social', icon: <SafetyCertificateOutlined />, label: '社保管理' },
  { key: '/attendance', icon: <ScheduleOutlined />, label: '考勤管理' },
  { key: '/tax', icon: <PercentageOutlined />, label: '个税扣缴' },
  { key: '/additional', icon: <PlusCircleOutlined />, label: '附加薪酬' },
  { key: '/payroll', icon: <DollarOutlined />, label: '薪资计算' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 220;

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [siderWidth, setSiderWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  // 社保管理有两个子页面，需要高亮父菜单
  const selectedKey = location.pathname.startsWith('/social')
    ? '/social'
    : location.pathname;

  const handleLogout = () => {
    localStorage.removeItem('supabase_token');
    navigate('/login');
  };

  // 拖动分隔条调整菜单栏宽度
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, width: siderWidth };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const delta = ev.clientX - start.x;
      let next = start.width + delta;
      if (next < MIN_WIDTH) next = MIN_WIDTH;
      if (next > MAX_WIDTH) next = MAX_WIDTH;
      setSiderWidth(next);
    };

    const onUp = () => {
      dragStartRef.current = null;
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [siderWidth]);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={siderWidth}
        collapsedWidth={64}
        style={{ background: '#001529', position: 'relative', overflow: 'auto' }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Typography.Text style={{ color: '#fff', fontSize: collapsed ? 14 : 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {collapsed ? '开弈' : '开弈集团薪酬系统'}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />

        {/* 可拖动分隔条 */}
        <div
          onMouseDown={onDragStart}
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 10,
            backgroundColor: dragging ? 'rgba(59,125,216,0.5)' : 'transparent',
            transition: dragging ? 'none' : 'background-color 0.15s',
          }}
          onMouseEnter={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,125,216,0.3)'; }}
          onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        />
      </Sider>

      <Layout style={{ height: '100%', overflow: 'hidden' }}>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          height: 56,
          flexShrink: 0,
        }}>
          <Dropdown menu={{
            items: [
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
            ],
            onClick: ({ key }) => { if (key === 'logout') handleLogout(); },
          }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>HR 管理员</span>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
