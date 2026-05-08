import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CriticOutputSchema,
  ExtractorOutputSchema,
  InterviewerOutputSchema,
  SpecWriterInputSchema,
} from './index';

function collectOptionalObjectProperties(
  schema: z.ZodTypeAny,
  path = '$',
  seen = new Set<z.ZodTypeAny>(),
): string[] {
  if (seen.has(schema)) {
    return [];
  }
  seen.add(schema);

  const def = schema._def as {
    typeName: z.ZodFirstPartyTypeKind;
    shape?: () => z.ZodRawShape;
    type?: z.ZodTypeAny;
    innerType?: z.ZodTypeAny;
    options?: z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>;
    left?: z.ZodTypeAny;
    right?: z.ZodTypeAny;
    schema?: z.ZodTypeAny;
  };

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    return Object.entries(def.shape?.() ?? {}).flatMap(([key, child]) => {
      const propertyPath = `${path}.${key}`;
      const childDef = child._def as { typeName: z.ZodFirstPartyTypeKind };
      const directOptional =
        childDef.typeName === z.ZodFirstPartyTypeKind.ZodOptional ? [propertyPath] : [];
      return [
        ...directOptional,
        ...collectOptionalObjectProperties(child, propertyPath, seen),
      ];
    });
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodArray && def.type) {
    return collectOptionalObjectProperties(def.type, `${path}[]`, seen);
  }

  if (
    (def.typeName === z.ZodFirstPartyTypeKind.ZodNullable ||
      def.typeName === z.ZodFirstPartyTypeKind.ZodOptional) &&
    def.innerType
  ) {
    return collectOptionalObjectProperties(def.innerType, path, seen);
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodUnion && def.options) {
    return [...def.options.values()].flatMap((option) =>
      collectOptionalObjectProperties(option, path, seen),
    );
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodIntersection) {
    return [def.left, def.right].flatMap((part) =>
      part ? collectOptionalObjectProperties(part, path, seen) : [],
    );
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodEffects && def.schema) {
    return collectOptionalObjectProperties(def.schema, path, seen);
  }

  return [];
}

describe('LLM contracts', () => {
  it('validates spec writer target format', () => {
    expect(() =>
      SpecWriterInputSchema.parse({
        spec: {
          meta: {
            id: 'doc_1',
            projectId: 'prj_1',
            sessionId: 'spec_1',
            title: 'Spec',
            version: '0.1.0',
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          product: { name: 'Spec', summary: 'Summary' },
          problem: { description: 'Problem', painPoints: [] },
          users: [],
          goals: [],
          nonGoals: [],
          scenarios: [],
          requirements: [],
          assumptions: [],
          openQuestions: [],
          acceptanceCriteria: [],
          risks: [],
          decisions: [],
        },
        targetFormat: 'markdown',
      }),
    ).not.toThrow();
  });

  it('keeps structured output schemas free of optional object properties', () => {
    const outputSchemas = {
      extractor: ExtractorOutputSchema,
      interviewer: InterviewerOutputSchema,
      critic: CriticOutputSchema,
    };

    const optionalProperties = Object.entries(outputSchemas).flatMap(([name, schema]) =>
      collectOptionalObjectProperties(schema).map((path) => `${name}${path.slice(1)}`),
    );

    expect(optionalProperties).toEqual([]);
  });
});
