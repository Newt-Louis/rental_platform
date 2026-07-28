import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUnitDto } from './create-unit.dto';

// Mall and lifecycle status are controlled by dedicated workflows, not by the
// generic unit information form.
export class UpdateUnitDto extends PartialType(
  OmitType(CreateUnitDto, ['mallId', 'status'] as const),
) {}
