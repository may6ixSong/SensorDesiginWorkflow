import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { DepartmentId } from '../common/constants/departments';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<UserDocument>) {}

  findAll() {
    return this.model.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  findByDepartment(department: DepartmentId) {
    return this.model.find({ department, isActive: true }).sort({ name: 1 }).exec();
  }

  async findById(id: string | Types.ObjectId) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  findByIdOrNull(id: string | Types.ObjectId) {
    return this.model.findById(id).exec();
  }

  findByEmpNo(empNo: string) {
    return this.model.findOne({ empNo }).exec();
  }
}
