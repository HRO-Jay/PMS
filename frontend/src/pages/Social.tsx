import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Tabs } from 'antd';
import { SafetyCertificateOutlined, SettingOutlined } from '@ant-design/icons';
import EmployeeSocial from './social/EmployeeSocial';
import WelfareSetPage from './social/WelfareSetPage';

const SocialPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = location.pathname === '/social/welfare-sets' ? 'welfare-sets' : 'employee-social';

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => navigate(`/social/${key}`)}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'employee-social', label: <span><SafetyCertificateOutlined />员工社保管理</span> },
          { key: 'welfare-sets', label: <span><SettingOutlined />福利套设置</span> },
        ]}
      />
      <Routes>
        <Route path="/" element={<Navigate to="employee-social" replace />} />
        <Route path="employee-social" element={<EmployeeSocial />} />
        <Route path="welfare-sets" element={<WelfareSetPage />} />
      </Routes>
    </div>
  );
};

export default SocialPage;
