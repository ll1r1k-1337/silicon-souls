import { NotFoundException } from '@nestjs/common';

export function throwNotFound(entity: string, id: string): never {
  throw new NotFoundException(`${entity} not found: ${id}`);
}
