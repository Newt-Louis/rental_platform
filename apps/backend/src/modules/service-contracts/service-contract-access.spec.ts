import { Role, ServiceContractSharePermission } from '@prisma/client';
import {
  canManageShares,
  outranks,
  resolveServiceContractPermission,
  roleCeiling,
} from './service-contract-access';

const { READ, EDIT, DELETE } = ServiceContractSharePermission;
const CREATOR = 'user-creator';
const OTHER = 'user-other';

const resolve = (
  role: Role,
  userId: string,
  share?: ServiceContractSharePermission,
) =>
  resolveServiceContractPermission({
    role,
    userId,
    createdById: CREATOR,
    share: share ? { permission: share } : null,
  });

describe('service contract record-level access', () => {
  describe('đọc là quyền nền của cả Mall', () => {
    it('cho người chưa được chia sẻ vẫn đọc được', () => {
      expect(resolve(Role.LEGAL, OTHER)).toBe(READ);
    });

    it('không nâng lên quá đọc chỉ vì vai trò nằm trong nhóm được sửa', () => {
      // Đây là điểm cốt lõi: vai trò là trần quyền, không phải thứ cấp quyền.
      expect(resolve(Role.MALL_DIRECTOR, OTHER)).toBe(READ);
      expect(resolve(Role.OPERATION, OTHER)).toBe(READ);
    });
  });

  describe('người tạo', () => {
    it('toàn quyền trên hồ sơ mình lập, không cần bản ghi chia sẻ nào', () => {
      expect(resolve(Role.OPERATION, CREATOR)).toBe(DELETE);
    });

    it('là người duy nhất (ngoài ADMIN) được cấp/thu hồi chia sẻ', () => {
      expect(canManageShares(Role.OPERATION, CREATOR, CREATOR)).toBe(true);
      // Không có chia sẻ nối đuôi: người được chia sẻ mức xoá vẫn không share tiếp được.
      expect(canManageShares(Role.MALL_DIRECTOR, OTHER, CREATOR)).toBe(false);
      expect(canManageShares(Role.ADMIN, OTHER, CREATOR)).toBe(true);
    });
  });

  describe('chia sẻ nâng quyền, trong giới hạn vai trò', () => {
    it('nâng đúng mức được chia sẻ khi vai trò cho phép', () => {
      expect(resolve(Role.LEGAL, OTHER, EDIT)).toBe(EDIT);
      expect(resolve(Role.LEASING_MANAGER, OTHER, DELETE)).toBe(DELETE);
    });

    it('bị vai trò chặn lại: FINANCE được chia sẻ mức xoá vẫn chỉ đọc', () => {
      // FINANCE xem được module nhưng không nằm trong nhóm được sửa, nên trần
      // quyền của họ là READ và chia sẻ không nới rộng ra được.
      expect(resolve(Role.FINANCE, OTHER, DELETE)).toBe(READ);
      expect(resolve(Role.CEO, OTHER, EDIT)).toBe(READ);
    });
  });

  describe('ADMIN', () => {
    it('toàn quyền trên mọi hợp đồng, kể cả không được chia sẻ', () => {
      expect(resolve(Role.ADMIN, OTHER)).toBe(DELETE);
    });
  });

  describe('thứ hạng quyền là luỹ tiến', () => {
    it('xoá bao gồm sửa, sửa bao gồm đọc', () => {
      expect(outranks(DELETE, EDIT)).toBe(true);
      expect(outranks(DELETE, READ)).toBe(true);
      expect(outranks(EDIT, READ)).toBe(true);
    });

    it('không đi ngược lại', () => {
      expect(outranks(READ, EDIT)).toBe(false);
      expect(outranks(EDIT, DELETE)).toBe(false);
    });
  });

  describe('trần quyền theo vai trò', () => {
    it.each([Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEGAL, Role.OPERATION, Role.ADMIN])(
      '%s có thể được nâng tới mức xoá',
      (role) => expect(roleCeiling(role)).toBe(DELETE),
    );

    it.each([Role.FINANCE, Role.CEO, Role.LEASING_EXECUTIVE, Role.TENANT])(
      '%s không bao giờ vượt quá đọc',
      (role) => expect(roleCeiling(role)).toBe(READ),
    );
  });
});
