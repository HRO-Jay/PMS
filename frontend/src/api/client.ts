import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截：自动附加 Supabase JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 也加上 apikey header（Supabase REST 需要）
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';
  if (apikey) {
    config.headers.apikey = apikey;
  }
  return config;
});

// 响应拦截：401 自动跳登录
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('supabase_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
