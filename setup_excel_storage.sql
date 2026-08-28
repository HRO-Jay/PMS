-- =============================================================
-- 原始表格存储权限配置（Supabase SQL Editor 执行一次即可）
--
-- 目标：excel-raw 存储桶，用于按【月份】存放 薪资计算/考勤管理 的原始 Excel。
-- 权限：
--   - 上传/写入：仅 人事专员(hr_staff) 和 管理员(admin)
--   - 读取/下载/预览：所有人(含匿名登录后已认证用户)
--   - 删除：仅 人事专员/管理员
--
-- 前提：存储桶 excel-raw 已创建（我已在后台建好，若未建，先执行下方第一段）。
-- =============================================================

-- 0) 若 bucket 未创建，取消下面注释执行
-- select storage.create_bucket('excel-raw', public := true);

-- 1) 允许已登录用户上传/覆盖到 excel-raw（仅人事专员/管理员，按 user_metadata.role 判断）
create policy "excel_raw_upload_hr"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'excel-raw'
  and coalesce((select raw_user_meta_data->>'role' from auth.users where id = auth.uid()), '') in ('hr_staff', 'admin')
);

create policy "excel_raw_update_hr"
on storage.objects for update
to authenticated
using (
  bucket_id = 'excel-raw'
  and coalesce((select raw_user_meta_data->>'role' from auth.users where id = auth.uid()), '') in ('hr_staff', 'admin')
);

-- 2) 允许所有已登录用户读取 excel-raw
create policy "excel_raw_read_all"
on storage.objects for select
to authenticated
using (bucket_id = 'excel-raw');

-- 3) 允许人事专员/管理员删除
create policy "excel_raw_delete_hr"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'excel-raw'
  and coalesce((select raw_user_meta_data->>'role' from auth.users where id = auth.uid()), '') in ('hr_staff', 'admin')
);

-- 4) 使 bucket 公共可读（无需登录即可下载/预览，方便前端预览）
update storage.buckets set public = true where id = 'excel-raw';
