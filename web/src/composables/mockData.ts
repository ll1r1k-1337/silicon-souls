import type { Message } from '@/types'

export const mockMessages: Message[] = [
  {
    id: '1',
    role: 'user',
    content: '@hr Hello! I need to hire a frontend developer for our new project.',
  },
  {
    id: '2',
    role: 'assistant',
    content:
      "Great! I'll find some excellent frontend developer candidates for your project. I've searched through our talent pool and here are three strong candidates that match your requirements. Each one brings a unique set of skills and experience to the table.",
    agentHandle: 'hr',
    agentName: 'HR Manager',
    candidates: [
      {
        id: 'c1',
        handle: 'sarah_dev',
        name: 'Sarah Mitchell',
        role: 'Senior Frontend Developer',
        personality:
          'Detail-oriented and collaborative, loves clean architecture and mentoring juniors.',
        skills: ['Vue.js', 'React', 'TypeScript', 'Tailwind CSS', 'GraphQL'],
        expectedSalary: '$125,000/year',
        hrComment:
          'Excellent cultural fit. 6+ years of experience with modern frontend frameworks. Led the UI redesign at her previous company.',
      },
      {
        id: 'c2',
        handle: 'marcus_ui',
        name: 'Marcus Johnson',
        role: 'UI Engineer',
        personality:
          'Creative problem-solver with a keen eye for design. Bridges the gap between design and development.',
        skills: ['React', 'Next.js', 'CSS Animations', 'Figma', 'Three.js'],
        expectedSalary: '$115,000/year',
        hrComment:
          'Strong portfolio with impressive interactive projects. Background in both design and engineering gives him a unique perspective.',
      },
      {
        id: 'c3',
        handle: 'yuki_fe',
        name: 'Yuki Tanaka',
        role: 'Frontend Architect',
        personality:
          'Systematic thinker who loves performance optimization and building scalable systems.',
        skills: ['Vue.js', 'Nuxt', 'WebAssembly', 'Performance', 'Testing'],
        expectedSalary: '$140,000/year',
        hrComment:
          'Top-tier candidate. Expert in frontend architecture and performance. Published several articles on web performance optimization.',
      },
    ],
  },
  {
    id: '3',
    role: 'user',
    content: "@alice What's our current sprint progress?",
  },
  {
    id: '4',
    role: 'assistant',
    content:
      "Hey! 👋 We're at 72% completion on the current sprint. Here's a quick breakdown:\n\n• **Completed:** 13 out of 18 stories\n• **In Progress:** 3 stories (auth module, dashboard charts, API docs)\n• **Blocked:** 2 stories waiting on the design team\n\nWe're on track for the Friday deadline, but we might need to push the blocked stories to next sprint if design doesn't deliver by Wednesday.",
    agentHandle: 'alice',
    agentName: 'Alice Chen',
  },
  {
    id: '5',
    role: 'user',
    content: '@bob Can you review the latest pull request?',
  },
  {
    id: '6',
    role: 'assistant',
    content:
      "Sure thing! I'll take a look at PR #247 right now. Give me a moment to go through the changes... 🔍\n\nOverall the code looks solid. I noticed a few things:\n1. The error handling in `useAuth` could be more granular\n2. Great job on the test coverage — 94% is above our target\n3. Consider using `computed` instead of `watch` on line 45 for better performance\n\nI'll leave detailed comments on the PR. Approve with minor suggestions!",
    agentHandle: 'bob',
    agentName: 'Bob Williams',
  },
]
