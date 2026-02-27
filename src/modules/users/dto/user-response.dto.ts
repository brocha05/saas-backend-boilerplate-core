import { User, UserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    description: 'Unique user identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@acme.com',
    format: 'email',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'Role of the user within the company',
    enum: UserRole,
    example: UserRole.MEMBER,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Whether the user has verified their email',
    example: false,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Company the user belongs to (UUID)',
    example: 'f9e8d7c6-b5a4-3210-fedc-ba0987654321',
  })
  companyId: string;

  @ApiProperty({
    description: 'Timestamp when the user was created',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp of the last update to the user',
    example: '2024-06-20T08:00:00.000Z',
  })
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.emailVerified = user.emailVerified;
    dto.companyId = user.companyId;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
