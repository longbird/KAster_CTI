import { IsBooleanString, IsOptional } from 'class-validator';

export class ListConsultCategoriesQueryDto {
  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}
