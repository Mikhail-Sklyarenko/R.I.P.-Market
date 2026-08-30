import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ExtensionSecurityService } from './extension-security.service';
import { UserOrExtensionAuthGuard } from './guards/user-or-extension-auth.guard';

/**
 * Shared extension session validation for listing + /extension/* routes.
 * Kept separate so Lots/Inventory can dual-auth without importing ExtensionModule
 * (which already imports InventoryModule).
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  providers: [ExtensionSecurityService, UserOrExtensionAuthGuard],
  // Re-export UsersModule so host modules (Inventory/Lots) can DI UsersService
  // when Nest instantiates UserOrExtensionAuthGuard in their context.
  exports: [
    ExtensionSecurityService,
    UserOrExtensionAuthGuard,
    forwardRef(() => UsersModule),
  ],
})
export class ExtensionSecurityModule {}