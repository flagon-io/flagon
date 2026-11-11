/**
 * What people can get in touch about. The contact page's topic picker, its
 * ?topic= deep links, and the subject line of the email it composes all read
 * from here.
 */
export type TopicId = "project" | "general" | "careers" | "press";

export type Topic = {
  id: TopicId;
  label: string;
  /** One line under the label in the picker. */
  hint: string;
  /** Subject line prefix for the composed email. */
  subject: string;
  /** Placeholder for the message box. */
  placeholder: string;
};

export const TOPICS: Topic[] = [
  {
    id: "project",
    label: "Start a project",
    hint: "Hire us to build something",
    subject: "New project",
    placeholder: "What it is, who it's for, and what done looks like. Links welcome.",
  },
  {
    id: "general",
    label: "Say hello",
    hint: "Questions, ideas, anything else",
    subject: "Hello",
    placeholder: "What's on your mind?",
  },
  {
    id: "careers",
    label: "Careers",
    hint: "Introduce yourself",
    subject: "Careers",
    placeholder: "Who you are, what you've made, and what you'd want to work on. Links welcome.",
  },
  {
    id: "press",
    label: "Press",
    hint: "Media and interviews",
    subject: "Press",
    placeholder: "Who you're with, what the story is, and your deadline.",
  },
];

export function isTopicId(v: unknown): v is TopicId {
  return TOPICS.some((t) => t.id === v);
}

/** Where a link should send someone who wants a given topic. */
export function contactHref(topic: TopicId = "general"): string {
  return topic === "general" ? "/contact" : `/contact?topic=${topic}`;
}
