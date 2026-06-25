import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MockLoginDto } from './dto/mock-login.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('mock-login')
  async mockLogin(@Body() body: MockLoginDto) {
    return this.authService.mockLogin(body);
  }
}
