import type { SpecArtifact } from '@sdd/domain';

export function payloadOf(artifact: SpecArtifact): Record<string, unknown> {
  return artifact.payload && typeof artifact.payload === 'object'
    ? (artifact.payload as Record<string, unknown>)
    : {};
}

export function isOpenQuestion(artifact: SpecArtifact): boolean {
  return artifact.artifactType === 'open_question';
}

export function baseSuggestedAnswers(artifact: SpecArtifact): string[] {
  const value = payloadOf(artifact).suggestedAnswers;
  return Array.isArray(value)
    ? value.filter((option): option is string => typeof option === 'string')
    : [];
}

export function answerOf(artifact: SpecArtifact): string {
  const answer = payloadOf(artifact).answer;
  return typeof answer === 'string' ? answer : '';
}

export function customAnswerOf(artifact: SpecArtifact): string {
  const answer = payloadOf(artifact).customAnswer;
  return typeof answer === 'string' ? answer : '';
}

export function isOtherOption(option: string): boolean {
  return /^other\b/i.test(option.trim());
}

export function allowsOtherAnswer(artifact: SpecArtifact): boolean {
  const payload = payloadOf(artifact);
  return payload.allowOtherAnswer === true || baseSuggestedAnswers(artifact).some(isOtherOption);
}

export function otherOptionLabel(artifact: SpecArtifact): string {
  const payload = payloadOf(artifact);
  if (typeof payload.otherAnswerLabel === 'string' && payload.otherAnswerLabel.trim()) {
    return payload.otherAnswerLabel.trim();
  }

  return baseSuggestedAnswers(artifact).find(isOtherOption) ?? 'Other';
}

export function choiceOptions(artifact: SpecArtifact): string[] {
  const options = baseSuggestedAnswers(artifact);
  if (!allowsOtherAnswer(artifact)) {
    return options;
  }

  return options.some(isOtherOption) ? options : [...options, otherOptionLabel(artifact)];
}

export function selectedAnswersOf(artifact: SpecArtifact): string[] {
  const payload = payloadOf(artifact);
  if (Array.isArray(payload.selectedAnswers)) {
    return payload.selectedAnswers.filter((option): option is string => typeof option === 'string');
  }

  const answerLines = answerOf(artifact)
    .split('\n')
    .map((answer) => answer.trim())
    .filter(Boolean);
  const options = choiceOptions(artifact);
  if (answerLines.length === 0 || options.length === 0) {
    return [];
  }

  const selected = options.filter((option) => answerLines.includes(option));
  const hasCustomAnswer = answerLines.some((answer) => !options.includes(answer));
  if (hasCustomAnswer && allowsOtherAnswer(artifact)) {
    selected.push(otherOptionLabel(artifact));
  }

  return selected;
}

export function inferredCustomAnswer(artifact: SpecArtifact): string {
  const customAnswer = customAnswerOf(artifact);
  if (customAnswer) {
    return customAnswer;
  }

  const options = choiceOptions(artifact);
  return answerOf(artifact)
    .split('\n')
    .map((answer) => answer.trim())
    .filter((answer) => answer && !options.includes(answer))
    .join('\n');
}

export function isMultipleChoice(artifact: SpecArtifact): boolean {
  const payload = payloadOf(artifact);
  return (
    payload.answerMode === 'multiple_choice' ||
    payload.answerMode === 'multiple' ||
    payload.choiceMode === 'multiple' ||
    payload.allowMultipleAnswers === true
  );
}

export function usesChoiceAnswers(artifact: SpecArtifact): boolean {
  const payload = payloadOf(artifact);
  return (
    choiceOptions(artifact).length > 0 &&
    payload.answerMode !== 'free_text'
  );
}

export function buildQuestionAnswer(
  artifact: SpecArtifact,
  selectedAnswers: string[],
  textAnswer: string,
  customAnswer: string,
): string {
  if (!usesChoiceAnswers(artifact)) {
    return textAnswer.trim();
  }

  const selectedWithoutOther = selectedAnswers
    .map((answer) => answer.trim())
    .filter((answer) => answer && !isOtherOption(answer));
  const custom = customAnswer.trim();
  const hasOther = selectedAnswers.some(isOtherOption);
  return [...selectedWithoutOther, hasOther ? custom : ''].filter(Boolean).join('\n');
}
