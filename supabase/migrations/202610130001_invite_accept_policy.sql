-- Cho phép người dùng xem các membership của chính mình ở mọi trạng thái
-- (cần thiết để thấy lời mời đang chờ) và tự chấp nhận lời mời
-- (chỉ chuyển invited -> active trên đúng dòng của mình).
-- Policies cộng dồn theo OR nên không làm yếu các policy hiện có.

create policy memberships_select_own on public.memberships
for select to authenticated
using (user_id = (select auth.uid()));

create policy memberships_accept_invite on public.memberships
for update to authenticated
using (user_id = (select auth.uid()) and status = 'invited')
with check (user_id = (select auth.uid()) and status = 'active');
