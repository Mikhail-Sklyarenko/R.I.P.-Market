import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import {
  AuthLoginParams,
  AuthLoginResult,
  AuthProvider,
} from './auth-provider.interface';

@Injectable()
export class MockAuthProvider implements AuthProvider {
  readonly type = 'mock' as const;

  constructor(private readonly usersService: UsersService) {}

  async login(params: AuthLoginParams): Promise<AuthLoginResult> {
    if (params.kind !== 'mock') {
      throw new BadRequestException(
        'Mock auth provider only supports mock login',
      );
    }

    const user = await this.usersService.getMockUserByRole(params.role);

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      steamId: user.steamId,
    };
  }
}
