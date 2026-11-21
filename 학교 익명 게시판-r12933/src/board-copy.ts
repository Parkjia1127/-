export const passwordLimits = { member: { min: 12, max: 19 }, owner: { min: 24, max: 128 } } as const;
export const passwordHint = (role: keyof typeof passwordLimits) => {
  const { min, max } = passwordLimits[role];
  return `초기 비밀번호와 다른 ${min}~${max}자의 비밀번호를 정해 주세요.`;
};
export function validNewPassword(value: unknown, role: keyof typeof passwordLimits): value is string {
  if (typeof value !== 'string' || value.length > 128 || /^\s*$/.test(value) || /^1+$/.test(value)) return false;
  const size = [...value].length, { min, max } = passwordLimits[role];
  return size >= min && size <= max;
}

export const copy = {
  site: '스쿨라운지', subtitle: '우리 학교 익명 게시판', board: '익명 게시판', skip: '본문 바로가기',
  heroTag: '우리 학교만의 이야기 공간', hero: '쉬는 시간처럼,\n편하게 이야기해요.',
  heroNote: '학교생활의 작은 궁금증부터 말 못 했던 이야기까지.\n여기서는 모두 익명이에요.',
  privacyTag: '승인된 회원만 입장', privacyTitle: '익명으로 이야기해요',
  privacyNote: '다른 회원에게 이름이나 계정 정보가 표시되지 않아요.',
  identityNotice: '다른 회원에게는 익명이지만, 운영자는 게시글·댓글·대댓글 작성자의 가입 닉네임을 확인할 수 있어요.',
  install: '설치 안내', logout: '로그아웃', login: '로그인', firstUse: '처음 이용하기',
  gateTag: '입장 신청', gate: '입장 승인 요청', gateNote: '닉네임과 비밀번호로 로그인한 다음 입장 승인을 요청해 주세요.',
  nickname: '닉네임', password: '비밀번호', initialPassword: '초기 비밀번호', next: '다음',
  firstUseNote: '닉네임을 정하고 초기 비밀번호 1111을 입력해 주세요.', changePassword: '새 비밀번호 설정',
  changeNote: passwordHint('member'), ownerChangeNote: passwordHint('owner'),
  newPassword: '새 비밀번호', confirmPassword: '새 비밀번호 확인', savePassword: '비밀번호 저장하고 로그인',
  setupOwner: '운영자 최초 설정', setupCode: '운영자 설정 코드', setupNote: '운영자 계정을 만드는 데 한 번만 사용하는 코드예요.',
  setupReadyNote: '저장한 설정 코드와 원하는 닉네임을 입력해 주세요. 비밀번호를 정하면 승인 없이 바로 들어갈 수 있어요.',
  setupMissingNote: '운영자 설정 코드를 아직 사용할 수 없어요. 설정 → 환경 변수에 24자 이상으로 저장했다면 프로젝트를 다시 열고 확인해 주세요.',
  setupSwitchNote: '현재 일반 회원으로 로그인되어 있어요. 로그아웃한 뒤 아직 사용하지 않은 닉네임으로 운영자 계정을 만들 수 있어요.',
  logoutSetup: '로그아웃하고 운영자 설정',
  openLoginTab: '새 탭에서 로그인',
  signedNote: '승인 요청을 보내면 운영자가 확인해요.', gateFoot: '운영자가 승인하기 전에는 글과 댓글을 볼 수 없어요.',
  stepLogin: '로그인', stepRequest: '승인 요청', stepEnter: '게시판 입장', request: '승인 요청 보내기',
  pending: '승인 대기 중', pendingNote: '요청을 보냈어요. 운영자가 승인하면 같은 계정으로 바로 입장할 수 있어요.',
  rejected: '입장 요청이 거절됐어요', rejectedNote: '자세한 내용은 학교 게시판 운영자에게 문의해 주세요.',
  revoked: '입장 승인이 취소됐어요', revokedNote: '다시 입장하려면 학교 게시판 운영자에게 문의해 주세요.',
  refresh: '상태 확인', footer: '서로를 존중하는 익명 커뮤니티', privateSpace: '학교 구성원 전용',
  boardNote: '질문부터 일상 이야기까지, 자유롭게 나눠요.', empty: '아직 글이 없어요. 첫 이야기를 남겨 보세요.',
  boardWarning: '', warningTitle: '주의 문구', editWarning: '주의 문구 설정', hideWarning: '게시판에서 숨기기',
  boardGuideTitle: '추가 안내', boardGuideBody: '글을 올리기 전에 이름이나 연락처 같은 개인정보가 들어 있지 않은지 확인해 주세요.',
  write: '글쓰기', title: '제목', body: '내용', publish: '글 올리기', comment: '댓글',
  sendComment: '댓글 쓰기', commentField: '댓글 내용', back: '목록으로', more: '더 보기', remove: '삭제',
  confirmPost: '이 글과 모든 댓글을 삭제할까요?', confirmComment: '이 댓글을 삭제할까요?',
  boardRefresh: '새로고침', loadingBoard: '불러오는 중…', refreshedBoard: '최신 내용을 불러왔어요.',
  reply: '답글 달기', replyField: '답글 내용', sendReply: '답글 등록', showReplies: '대댓글 보기', hideReplies: '대댓글 접기',
  writerBadge: '글쓴이', anonymousLabel: '익명', nicknameLabel: '가입 닉네임',
  moreReplies: '이전 답글 더 보기', deletedComment: '삭제된 댓글이에요.', confirmRoot: '이 댓글을 삭제할까요? 달린 답글은 남아요.', confirmReply: '이 답글을 삭제할까요?',
  postAuthors: '게시글 작성자', noPostAuthors: '확인할 게시글이 없어요.', unknownAuthor: '닉네임 기록 없음',
  manage: '운영자 화면', manageNote: '입장 요청을 검토하고 게시물 관리자 권한을 관리해요.',
  requests: '입장 요청', members: '승인된 회원', audit: '삭제 기록', decisions: '거절·승인 취소',
  noRequests: '대기 중인 요청이 없어요.', noMembers: '승인된 회원이 없어요.', noAudit: '관리자 삭제 기록이 없어요.', noDecisions: '처리된 계정이 없어요.',
  approve: '승인', reject: '거절', revoke: '입장 승인 취소', grant: '관리자 권한 부여', demote: '관리자 권한 회수',
  member: '일반 회원', moderator: '게시물 관리자', owner: '운영자',
  edit: '문구 편집 모드', exitEdit: '편집 모드 종료', editHint: '수정할 문구를 클릭하세요. 버튼은 실행되지 않고 편집창이 열려요.',
  editEntry: '초기 화면 편집', exitEntry: '게시판 화면으로 돌아가기', entryViews: '입장 화면 미리보기',
  allCopy: '전체 문구', editTitle: '문구 편집', editValue: '표시 문구', save: '저장', cancel: '취소', reset: '기본 문구로 되돌리기',
  installTitle: '홈 화면에 설치하기', installNote: '브라우저에서 열면 홈 화면에 추가할 수 있어요.',
  ios: '아이폰 · Safari', iosSteps: '공유 버튼 → 홈 화면에 추가 → 추가',
  android: '안드로이드 · Chrome', androidSteps: '오른쪽 위 ⋮ 메뉴 → 앱 설치 또는 홈 화면에 추가', close: '닫기',
} as const;
export type CopyKey = keyof typeof copy;
export type Session = { role: 'owner' | 'moderator' | 'member'; status: 'new' | 'pending' | 'approved' | 'rejected' | 'revoked' };
type Entry = { id: number; body: string; created_at: string; can_delete: number; can_edit: number; edited: number };
export type Comment = Entry & { by_writer: number; nickname?: string | null };
export type Reply = Comment;
export type RootComment = (Comment & { deleted: 0 }) | { id: number; deleted: 1; can_delete: 0 };
export type CommentThread = RootComment & { reply_count: number };
export type Post = Entry & { title: string; comment_count: number; nickname?: string | null };
export type Reaction = 'like' | 'dislike';
export type ReactionCounts = { like_count: number; dislike_count: number };
export type PostDetail = Post & ReactionCounts & { my_reaction: Reaction | null };
export type ReactionRow = { id: number; nickname: string | null; reaction: Reaction };
export type PostAuthor = { id: number; title: string; created_at: string; nickname: string | null };
export type Account = Session & { id: number; nickname: string; requested_at: string | null };
export type Deletion = { id: number; kind: 'post' | 'comment' | 'reply'; item_id: number; post_id: number; actor_nickname: string; created_at: string };
