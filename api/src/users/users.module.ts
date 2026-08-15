import { Module } from '@nestjs/common';
import { User, UserSchema } from './schemas/user.schema';
import { registerModels } from '../database/model-registration';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [registerModels([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
