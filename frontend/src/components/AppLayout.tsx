import React, { useState } from 'react';
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

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // 社保管理有两个子页面，需要高亮父菜单
  const selectedKey = location.pathname.startsWith('/social')
    ? '/social'
    : location.pathname;

  const handleLogout = () => {
    localStorage.removeItem('supabase_token');
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: '#001529' }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Typography.Text style={{ color: '#fff', fontSize: collapsed ? 14 : 16, fontWeight: 700 }}>
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
      </Sider>

      <Layout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          height: 56,
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
