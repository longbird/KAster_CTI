import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ImportCustomerRowDto {
  @IsString()
  대표전화번호!: string;

  @IsString()
  성명!: string;

  @IsOptional()
  @IsString()
  등급?: string;

  @IsOptional()
  @IsString()
  추가전화번호1?: string;

  @IsOptional()
  @IsString()
  추가전화번호2?: string;

  @IsOptional()
  @IsString()
  기본메모?: string;
}

export class ImportCustomersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRowDto)
  rows!: ImportCustomerRowDto[];
}
