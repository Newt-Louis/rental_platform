import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';

// PermissionsService itself lives in CommonModule (@Global()) so RolesGuard
// can inject it without a circular module dependency -- this module only
// wires up the HTTP surface.
@Module({
  controllers: [PermissionsController],
})
export class PermissionsModule {}
