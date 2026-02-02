// Path Finder Decision Tree
// Helps users discover what to build toward freedom

export interface TreeNode {
  id: string
  type: 'question' | 'suggestion'
  title: string
  description?: string
  emoji?: string
  options?: TreeOption[]
  // For suggestion nodes
  suggestion?: ProjectSuggestion
}

export interface TreeOption {
  label: string
  description?: string
  emoji?: string
  nextNodeId: string
}

export interface ProjectSuggestion {
  name: string
  tagline: string
  description: string
  whyItWorks: string[]
  skillsUsed: string[]
  timeToMvp: string
  incomeModel: string
  examples: string[]
  firstSteps: string[]
  milestones: SuggestedMilestone[]
}

export interface SuggestedMilestone {
  title: string
  description: string
}

// The complete decision tree
export const pathFinderTree: Record<string, TreeNode> = {
  // ================================
  // START - Root Question
  // ================================
  start: {
    id: 'start',
    type: 'question',
    title: 'What do you really want?',
    description: 'Be honest with yourself. There are no wrong answers.',
    emoji: '🎯',
    options: [
      {
        label: 'Freedom',
        description: 'Income without obligations, work on what I want',
        emoji: '🦅',
        nextNodeId: 'freedom-type',
      },
      {
        label: 'Impact',
        description: 'Make a difference, help people, leave a mark',
        emoji: '💫',
        nextNodeId: 'impact-type',
      },
      {
        label: 'Security',
        description: 'Stable income, safety net, peace of mind',
        emoji: '🛡️',
        nextNodeId: 'security-type',
      },
      {
        label: 'Adventure',
        description: 'New experiences, travel, variety',
        emoji: '🌍',
        nextNodeId: 'adventure-type',
      },
    ],
  },

  // ================================
  // FREEDOM PATH
  // ================================
  'freedom-type': {
    id: 'freedom-type',
    type: 'question',
    title: 'How do you want to earn?',
    description: 'There are two main paths to freedom income.',
    emoji: '💰',
    options: [
      {
        label: 'Build once, sell repeatedly',
        description: 'Products, tools, content - work hard upfront, earn forever',
        emoji: '📦',
        nextNodeId: 'product-skills',
      },
      {
        label: 'Trade time for money (premium)',
        description: 'High-value services, consulting, freelancing',
        emoji: '⏱️',
        nextNodeId: 'service-skills',
      },
      {
        label: 'Passive investments',
        description: 'Requires capital - not your current path',
        emoji: '📈',
        nextNodeId: 'passive-reality',
      },
    ],
  },

  'passive-reality': {
    id: 'passive-reality',
    type: 'question',
    title: 'Passive income requires capital',
    description: "Since you're in building mode, let's focus on creating assets first. Once you have income, you can invest it passively.",
    emoji: '💡',
    options: [
      {
        label: 'Build products',
        description: 'Create something sellable',
        emoji: '📦',
        nextNodeId: 'product-skills',
      },
      {
        label: 'Offer services',
        description: 'Build capital through high-value work',
        emoji: '⏱️',
        nextNodeId: 'service-skills',
      },
    ],
  },

  // ================================
  // PRODUCT PATH - Skills Branch
  // ================================
  'product-skills': {
    id: 'product-skills',
    type: 'question',
    title: 'What skills do you bring?',
    description: 'Pick what resonates most. AI can fill the gaps.',
    emoji: '🧠',
    options: [
      {
        label: 'Math & Science',
        description: 'Analytical thinking, data, logic, problem-solving',
        emoji: '🔬',
        nextNodeId: 'product-math',
      },
      {
        label: 'Technical',
        description: 'Coding, systems, automation, tools',
        emoji: '💻',
        nextNodeId: 'product-technical',
      },
      {
        label: 'Domain Knowledge',
        description: 'Expertise in a specific field (fitness, finance, etc.)',
        emoji: '📚',
        nextNodeId: 'product-domain',
      },
      {
        label: 'Communication',
        description: 'Writing, teaching, explaining complex ideas',
        emoji: '✍️',
        nextNodeId: 'product-communication',
      },
    ],
  },

  // ================================
  // PRODUCT + MATH/SCIENCE
  // ================================
  'product-math': {
    id: 'product-math',
    type: 'question',
    title: 'What interests you most?',
    description: 'Your math/science background opens many doors.',
    emoji: '🔢',
    options: [
      {
        label: 'Data & Visualization',
        description: 'Making complex data understandable',
        emoji: '📊',
        nextNodeId: 'suggest-data-tools',
      },
      {
        label: 'Calculators & Simulators',
        description: 'Interactive tools that compute things',
        emoji: '🧮',
        nextNodeId: 'suggest-calculators',
      },
      {
        label: 'Education',
        description: 'Teaching math/science concepts',
        emoji: '🎓',
        nextNodeId: 'suggest-education',
      },
      {
        label: 'Decision Tools',
        description: 'Helping people make better choices',
        emoji: '⚖️',
        nextNodeId: 'suggest-decision-tools',
      },
    ],
  },

  // Data Tools Suggestion
  'suggest-data-tools': {
    id: 'suggest-data-tools',
    type: 'suggestion',
    title: 'Data Visualization Tools',
    emoji: '📊',
    suggestion: {
      name: 'Data Visualization SaaS',
      tagline: 'Turn complex data into clear insights',
      description: 'Build interactive dashboards, chart generators, or data transformation tools. People pay to understand their data better.',
      whyItWorks: [
        'Data is everywhere but insights are rare',
        'Math background helps you spot patterns others miss',
        'AI can generate visualizations from descriptions',
        'B2B market pays premium for clarity',
      ],
      skillsUsed: ['Data analysis', 'Pattern recognition', 'Visual communication'],
      timeToMvp: '2-4 weeks',
      incomeModel: 'SaaS subscription ($10-50/month) or one-time templates',
      examples: [
        'Chart generator from CSV uploads',
        'Financial dashboard builder',
        'Survey results visualizer',
        'Metrics tracking dashboard',
      ],
      firstSteps: [
        'Pick a specific data type (surveys, finances, health)',
        'Design one compelling visualization',
        'Build with AI assistance',
        'Find 5 people who have that data problem',
      ],
      milestones: [
        { title: 'Define the problem', description: 'Identify specific data visualization pain point' },
        { title: 'Design the solution', description: 'Sketch the core visualization interface' },
        { title: 'Build MVP', description: 'Create working prototype with AI' },
        { title: 'Get feedback', description: 'Show to 5 potential users' },
        { title: 'Iterate', description: 'Improve based on feedback' },
        { title: 'Launch', description: 'Ship to first paying customers' },
      ],
    },
  },

  // Calculators Suggestion
  'suggest-calculators': {
    id: 'suggest-calculators',
    type: 'suggestion',
    title: 'Interactive Calculators',
    emoji: '🧮',
    suggestion: {
      name: 'Niche Calculator Tools',
      tagline: 'Calculators for specific industries/problems',
      description: 'Build calculators that solve real problems: ROI calculators, fitness calculators, financial projections, scientific converters.',
      whyItWorks: [
        'People trust numbers - they want to calculate before deciding',
        'SEO goldmine - "X calculator" searches are huge',
        'Math skills let you build accurate, trustworthy tools',
        'Can monetize with ads, affiliate, or premium features',
      ],
      skillsUsed: ['Mathematical modeling', 'Formula implementation', 'UI/UX'],
      timeToMvp: '1-2 weeks per calculator',
      incomeModel: 'Ads, affiliate links, premium versions, white-label',
      examples: [
        'Compound interest calculator with scenarios',
        'Macro nutrition calculator',
        'Solar panel savings calculator',
        'Rent vs buy decision tool',
      ],
      firstSteps: [
        'Research high-volume "calculator" keywords',
        'Pick one with low competition',
        'Build better than existing options',
        'Optimize for SEO',
      ],
      milestones: [
        { title: 'Research', description: 'Find calculator opportunity with search volume' },
        { title: 'Design', description: 'Plan inputs, outputs, and user experience' },
        { title: 'Build', description: 'Create the calculator with AI help' },
        { title: 'Polish', description: 'Add explanations, visualizations, share features' },
        { title: 'Optimize', description: 'SEO, page speed, mobile experience' },
        { title: 'Monetize', description: 'Add ads or premium features' },
      ],
    },
  },

  // Education Suggestion
  'suggest-education': {
    id: 'suggest-education',
    type: 'suggestion',
    title: 'Math/Science Education',
    emoji: '🎓',
    suggestion: {
      name: 'Educational Content Platform',
      tagline: 'Make math/science accessible and engaging',
      description: 'Create courses, tutorials, or interactive learning tools. The education market is massive and always growing.',
      whyItWorks: [
        'You understand the concepts deeply',
        'Most math content is boring - yours can be different',
        'AI can help create variations and exercises',
        'Recurring revenue from courses/subscriptions',
      ],
      skillsUsed: ['Subject matter expertise', 'Teaching', 'Curriculum design'],
      timeToMvp: '2-6 weeks',
      incomeModel: 'Course sales ($50-500), subscription ($10-30/mo), tutoring',
      examples: [
        'Interactive physics simulations',
        'Statistics for non-statisticians course',
        'Visual math problem solver',
        'Science experiment guides',
      ],
      firstSteps: [
        'Pick ONE topic you can explain better than anyone',
        'Create one lesson/video as proof of concept',
        'Share it free, gather feedback',
        'Build audience before building product',
      ],
      milestones: [
        { title: 'Pick topic', description: 'Choose specific concept you explain well' },
        { title: 'Create sample', description: 'Build one lesson/tutorial as proof' },
        { title: 'Get feedback', description: 'Share with learners, iterate' },
        { title: 'Build curriculum', description: 'Expand into full course structure' },
        { title: 'Platform setup', description: 'Choose hosting (Teachable, Gumroad, own site)' },
        { title: 'Launch', description: 'Open for enrollment' },
      ],
    },
  },

  // Decision Tools Suggestion
  'suggest-decision-tools': {
    id: 'suggest-decision-tools',
    type: 'suggestion',
    title: 'Decision Support Tools',
    emoji: '⚖️',
    suggestion: {
      name: 'Decision Framework Tool',
      tagline: 'Help people make better choices with data',
      description: 'Build tools that help people make complex decisions: weighted decision matrices, scenario comparisons, risk assessments.',
      whyItWorks: [
        'Decision paralysis is epidemic - people pay for clarity',
        'Math skills help build legitimate frameworks',
        'B2B buyers love data-driven tools',
        'Can specialize by industry for premium pricing',
      ],
      skillsUsed: ['Decision theory', 'Probability', 'User psychology'],
      timeToMvp: '2-4 weeks',
      incomeModel: 'Freemium SaaS, consulting add-on, team plans',
      examples: [
        'Vendor comparison tool',
        'Investment decision matrix',
        'Hire/no-hire scoring system',
        'Risk assessment calculator',
      ],
      firstSteps: [
        'Identify a decision people struggle with',
        'Build a simple weighted scoring system',
        'Test with real decision makers',
        'Add visualizations and explanations',
      ],
      milestones: [
        { title: 'Research', description: 'Find a common decision problem' },
        { title: 'Framework', description: 'Design the decision methodology' },
        { title: 'Build tool', description: 'Create interactive version' },
        { title: 'Test', description: 'Have people use it for real decisions' },
        { title: 'Improve', description: 'Add features based on usage' },
        { title: 'Monetize', description: 'Launch paid tiers' },
      ],
    },
  },

  // ================================
  // PRODUCT + TECHNICAL
  // ================================
  'product-technical': {
    id: 'product-technical',
    type: 'question',
    title: 'What type of technical product?',
    description: 'Technical skills unlock many product types.',
    emoji: '💻',
    options: [
      {
        label: 'Developer Tools',
        description: 'Tools that help other developers',
        emoji: '🛠️',
        nextNodeId: 'suggest-dev-tools',
      },
      {
        label: 'Automation',
        description: 'Save people time with automated workflows',
        emoji: '🤖',
        nextNodeId: 'suggest-automation',
      },
      {
        label: 'AI-Powered Apps',
        description: 'Leverage AI to solve problems',
        emoji: '🧠',
        nextNodeId: 'suggest-ai-apps',
      },
      {
        label: 'Browser Extensions',
        description: 'Small tools that enhance browsing',
        emoji: '🧩',
        nextNodeId: 'suggest-extensions',
      },
    ],
  },

  'suggest-dev-tools': {
    id: 'suggest-dev-tools',
    type: 'suggestion',
    title: 'Developer Tools',
    emoji: '🛠️',
    suggestion: {
      name: 'Developer Productivity Tool',
      tagline: 'Make developers more productive',
      description: 'Build tools that solve developer pain points: code generators, documentation helpers, testing utilities, deployment tools.',
      whyItWorks: [
        'Developers buy tools that save time',
        'Technical users appreciate quality',
        'Strong word-of-mouth in dev communities',
        'Can grow organically through GitHub/ProductHunt',
      ],
      skillsUsed: ['Programming', 'Developer experience', 'Problem-solving'],
      timeToMvp: '2-6 weeks',
      incomeModel: 'Freemium, pay-per-seat, open-source with paid features',
      examples: [
        'API documentation generator',
        'Code review assistant',
        'Database schema visualizer',
        'Environment management tool',
      ],
      firstSteps: [
        'Identify a task you repeat often',
        'Build a tool to automate it',
        'Share with developer communities',
        'Iterate based on feedback',
      ],
      milestones: [
        { title: 'Identify pain', description: 'Find a repeatable developer problem' },
        { title: 'Build MVP', description: 'Create minimal working solution' },
        { title: 'Dogfood', description: 'Use it yourself extensively' },
        { title: 'Share', description: 'Post on GitHub, Twitter, Reddit' },
        { title: 'Gather feedback', description: 'Listen to early users' },
        { title: 'Monetize', description: 'Add paid tier for power features' },
      ],
    },
  },

  'suggest-automation': {
    id: 'suggest-automation',
    type: 'suggestion',
    title: 'Automation Tools',
    emoji: '🤖',
    suggestion: {
      name: 'Workflow Automation',
      tagline: 'Automate tedious business tasks',
      description: 'Build tools that connect services, automate repetitive work, or streamline business processes.',
      whyItWorks: [
        'Everyone has tasks they hate doing',
        'Automation saves hours → people pay gladly',
        'AI makes complex automation easier',
        'Sticky product - hard to switch once integrated',
      ],
      skillsUsed: ['API integration', 'Workflow design', 'Systems thinking'],
      timeToMvp: '2-4 weeks',
      incomeModel: 'Per-automation pricing, usage-based, subscription',
      examples: [
        'Invoice processing automation',
        'Social media scheduler',
        'Data sync between tools',
        'Report generation automation',
      ],
      firstSteps: [
        'Find a manual process that frustrates people',
        'Map out the workflow',
        'Build automation with AI help',
        'Offer to set it up for first customers',
      ],
      milestones: [
        { title: 'Find workflow', description: 'Identify painful manual process' },
        { title: 'Map it', description: 'Document current steps and tools' },
        { title: 'Design automation', description: 'Plan the automated solution' },
        { title: 'Build', description: 'Create the automation' },
        { title: 'Test', description: 'Run with real data' },
        { title: 'Package', description: 'Make it easy for others to use' },
      ],
    },
  },

  'suggest-ai-apps': {
    id: 'suggest-ai-apps',
    type: 'suggestion',
    title: 'AI-Powered Applications',
    emoji: '🧠',
    suggestion: {
      name: 'AI-Powered SaaS',
      tagline: 'Use AI to solve specific problems',
      description: 'Build applications that leverage AI for content generation, analysis, personalization, or automation. The AI does the heavy lifting.',
      whyItWorks: [
        'AI capabilities are exploding - leverage them',
        'Non-technical people need AI interfaces',
        'Vertical AI apps command premium prices',
        'You can build in weeks what took years before',
      ],
      skillsUsed: ['AI prompting', 'Product design', 'Integration'],
      timeToMvp: '1-3 weeks',
      incomeModel: 'Usage-based, subscription, pay-per-generation',
      examples: [
        'AI writing assistant for niche (legal, medical)',
        'Product description generator',
        'AI customer support bot builder',
        'Resume optimizer',
      ],
      firstSteps: [
        'Pick a specific use case for AI',
        'Build wrapper around AI API',
        'Add value through UI, templates, workflow',
        'Find niche market willing to pay',
      ],
      milestones: [
        { title: 'Define use case', description: 'Pick specific AI application' },
        { title: 'Prototype', description: 'Test AI prompts and outputs' },
        { title: 'Build UI', description: 'Create user-friendly interface' },
        { title: 'Add value', description: 'Templates, workflows, integrations' },
        { title: 'Test pricing', description: 'Experiment with monetization' },
        { title: 'Launch', description: 'Go to market' },
      ],
    },
  },

  'suggest-extensions': {
    id: 'suggest-extensions',
    type: 'suggestion',
    title: 'Browser Extensions',
    emoji: '🧩',
    suggestion: {
      name: 'Productivity Browser Extension',
      tagline: 'Small tools, big impact',
      description: 'Browser extensions are quick to build and have direct distribution through stores. Solve one problem really well.',
      whyItWorks: [
        'Low barrier to entry - quick to build',
        'Built-in distribution (Chrome/Firefox stores)',
        'Can validate ideas very quickly',
        'Power users pay for productivity tools',
      ],
      skillsUsed: ['JavaScript', 'Browser APIs', 'UI/UX'],
      timeToMvp: '1-2 weeks',
      incomeModel: 'Freemium, one-time purchase, subscription for sync',
      examples: [
        'Tab manager with AI suggestions',
        'Screenshot annotation tool',
        'Price tracking extension',
        'Focus mode blocker',
      ],
      firstSteps: [
        'Identify browser-based frustration',
        'Build simple extension to solve it',
        'Publish to Chrome store',
        'Iterate based on reviews',
      ],
      milestones: [
        { title: 'Find problem', description: 'Identify browser-based pain point' },
        { title: 'Design', description: 'Plan minimal feature set' },
        { title: 'Build', description: 'Create extension' },
        { title: 'Test', description: 'Use daily yourself' },
        { title: 'Publish', description: 'Submit to extension stores' },
        { title: 'Market', description: 'Share in relevant communities' },
      ],
    },
  },

  // ================================
  // PRODUCT + DOMAIN KNOWLEDGE
  // ================================
  'product-domain': {
    id: 'product-domain',
    type: 'question',
    title: 'Which domain?',
    description: 'Domain expertise is valuable even if you want to leave the industry.',
    emoji: '📚',
    options: [
      {
        label: 'Fitness/Health',
        description: 'Gym, wellness, nutrition, training',
        emoji: '💪',
        nextNodeId: 'suggest-fitness-product',
      },
      {
        label: 'Finance/Business',
        description: 'Money, accounting, business ops',
        emoji: '💵',
        nextNodeId: 'suggest-finance-product',
      },
      {
        label: 'Other Industry',
        description: 'Different field expertise',
        emoji: '🏢',
        nextNodeId: 'suggest-niche-product',
      },
    ],
  },

  'suggest-fitness-product': {
    id: 'suggest-fitness-product',
    type: 'suggestion',
    title: 'Fitness Industry Tools',
    emoji: '💪',
    suggestion: {
      name: 'Fitness Business Tool',
      tagline: 'Tools for gym owners and trainers',
      description: 'Use your gym industry knowledge to build tools that help other fitness businesses: client management, programming generators, business analytics.',
      whyItWorks: [
        'You know the pain points firsthand',
        'Fitness industry is massive and growing',
        'Most existing tools are mediocre',
        'Can sell to former competitors',
      ],
      skillsUsed: ['Industry knowledge', 'Client management', 'Business operations'],
      timeToMvp: '3-6 weeks',
      incomeModel: 'SaaS subscription ($30-100/month)',
      examples: [
        'AI workout program generator',
        'Client progress tracker for trainers',
        'Gym class scheduling optimizer',
        'Nutrition plan creator',
      ],
      firstSteps: [
        'List every tool your gym uses',
        'Identify the worst one',
        'Build something better',
        'Sell to other gym owners you know',
      ],
      milestones: [
        { title: 'Audit', description: 'List all gym industry pain points' },
        { title: 'Prioritize', description: 'Pick the most painful, least solved' },
        { title: 'Design', description: 'Create solution architecture' },
        { title: 'Build MVP', description: 'Create minimal working product' },
        { title: 'Test', description: 'Try with your gym or friend\'s gym' },
        { title: 'Sell', description: 'Reach out to gym owner network' },
      ],
    },
  },

  'suggest-finance-product': {
    id: 'suggest-finance-product',
    type: 'suggestion',
    title: 'Finance/Business Tools',
    emoji: '💵',
    suggestion: {
      name: 'Financial Tool',
      tagline: 'Help people manage money better',
      description: 'Build tools for budgeting, investing, business finance, or financial planning. Money tools have high perceived value.',
      whyItWorks: [
        'Everyone cares about money',
        'Financial tools command premium pricing',
        'Math skills = credibility in finance',
        'Recurring need = recurring revenue',
      ],
      skillsUsed: ['Financial modeling', 'Data analysis', 'Math'],
      timeToMvp: '2-4 weeks',
      incomeModel: 'Subscription, one-time templates, consulting add-on',
      examples: [
        'Cash flow forecasting tool',
        'Investment portfolio analyzer',
        'Invoice/expense tracker',
        'Pricing calculator for services',
      ],
      firstSteps: [
        'Pick specific financial problem',
        'Build spreadsheet version first',
        'Convert to web app with AI help',
        'Find niche willing to pay',
      ],
      milestones: [
        { title: 'Define problem', description: 'Choose specific financial pain' },
        { title: 'Prototype', description: 'Build in spreadsheet first' },
        { title: 'Validate', description: 'Test with potential users' },
        { title: 'Build app', description: 'Create web version' },
        { title: 'Add features', description: 'Reporting, export, integrations' },
        { title: 'Launch', description: 'Go to market' },
      ],
    },
  },

  'suggest-niche-product': {
    id: 'suggest-niche-product',
    type: 'suggestion',
    title: 'Niche Industry Tool',
    emoji: '🏢',
    suggestion: {
      name: 'Vertical SaaS',
      tagline: 'Industry-specific software sells itself',
      description: 'Build tools for a specific industry you understand. Vertical SaaS has less competition and higher willingness to pay than horizontal tools.',
      whyItWorks: [
        'Industry insiders trust industry insiders',
        'Less competition than horizontal SaaS',
        'Can charge more for specialized tools',
        'Word of mouth spreads fast in industries',
      ],
      skillsUsed: ['Domain expertise', 'Process understanding', 'Networking'],
      timeToMvp: '4-8 weeks',
      incomeModel: 'SaaS subscription, implementation fees',
      examples: [
        'Restaurant inventory management',
        'Real estate showing scheduler',
        'Event planner CRM',
        'Contractor quote generator',
      ],
      firstSteps: [
        'Pick industry you know well',
        'Interview 10 people about their tools',
        'Find the gap',
        'Build to fill it',
      ],
      milestones: [
        { title: 'Research', description: 'Interview industry professionals' },
        { title: 'Identify gap', description: 'Find underserved software need' },
        { title: 'Validate', description: 'Get commitments before building' },
        { title: 'Build', description: 'Create MVP' },
        { title: 'Pilot', description: 'Run with 3-5 pilot customers' },
        { title: 'Scale', description: 'Expand to broader market' },
      ],
    },
  },

  // ================================
  // PRODUCT + COMMUNICATION
  // ================================
  'product-communication': {
    id: 'product-communication',
    type: 'question',
    title: 'Communication into products?',
    description: 'Great communication skills can be productized.',
    emoji: '✍️',
    options: [
      {
        label: 'Content/Media',
        description: 'Newsletters, videos, podcasts',
        emoji: '📰',
        nextNodeId: 'suggest-content',
      },
      {
        label: 'Templates/Frameworks',
        description: 'Reusable documents, systems',
        emoji: '📋',
        nextNodeId: 'suggest-templates',
      },
      {
        label: 'Writing Tools',
        description: 'Help others write better',
        emoji: '🖊️',
        nextNodeId: 'suggest-writing-tools',
      },
    ],
  },

  'suggest-content': {
    id: 'suggest-content',
    type: 'suggestion',
    title: 'Content Business',
    emoji: '📰',
    suggestion: {
      name: 'Paid Newsletter/Content',
      tagline: 'Turn expertise into recurring content',
      description: 'Build an audience around your expertise, then monetize through paid subscriptions, sponsorships, or premium content.',
      whyItWorks: [
        'Low startup cost, high leverage',
        'Build authority and audience simultaneously',
        'Multiple monetization options',
        'AI helps create content faster',
      ],
      skillsUsed: ['Writing', 'Teaching', 'Consistency'],
      timeToMvp: '1 week to start, 6 months to monetize',
      incomeModel: 'Subscriptions ($5-20/mo), sponsorships, products',
      examples: [
        'Weekly industry analysis',
        'Tutorial newsletter',
        'Curated links with commentary',
        'Case study breakdowns',
      ],
      firstSteps: [
        'Pick a topic you can write about forever',
        'Start free newsletter (Substack/Beehiiv)',
        'Publish weekly minimum',
        'Add paid tier once you have 1000 subscribers',
      ],
      milestones: [
        { title: 'Choose topic', description: 'Pick sustainable niche' },
        { title: 'Set up platform', description: 'Create newsletter infrastructure' },
        { title: 'Write 10 posts', description: 'Build content backlog' },
        { title: 'Grow to 500', description: 'First subscriber milestone' },
        { title: 'Grow to 1000', description: 'Monetization threshold' },
        { title: 'Launch paid', description: 'Add premium tier' },
      ],
    },
  },

  'suggest-templates': {
    id: 'suggest-templates',
    type: 'suggestion',
    title: 'Template Business',
    emoji: '📋',
    suggestion: {
      name: 'Template/Framework Products',
      tagline: 'Sell your systems to others',
      description: 'Package your processes, frameworks, and documents as sellable templates. Notion templates, Figma kits, document packs.',
      whyItWorks: [
        'Create once, sell forever',
        'People pay to skip the thinking',
        'Distribution through marketplaces',
        'Low support burden',
      ],
      skillsUsed: ['Process design', 'Documentation', 'Organization'],
      timeToMvp: '1-2 weeks',
      incomeModel: 'One-time purchases ($10-100), bundles ($50-500)',
      examples: [
        'Notion productivity system',
        'Business plan template',
        'Project management framework',
        'SOPs for specific industries',
      ],
      firstSteps: [
        'Document a system you use',
        'Polish it into a template',
        'Sell on Gumroad/Notion marketplace',
        'Create variations for different niches',
      ],
      milestones: [
        { title: 'Choose system', description: 'Pick your best process' },
        { title: 'Document', description: 'Write comprehensive template' },
        { title: 'Design', description: 'Make it visually appealing' },
        { title: 'Price', description: 'Research competitive pricing' },
        { title: 'List', description: 'Add to marketplaces' },
        { title: 'Promote', description: 'Share in relevant communities' },
      ],
    },
  },

  'suggest-writing-tools': {
    id: 'suggest-writing-tools',
    type: 'suggestion',
    title: 'Writing Assistance Tools',
    emoji: '🖊️',
    suggestion: {
      name: 'AI Writing Tool',
      tagline: 'Help others write better',
      description: 'Build tools that help people write: grammar checkers, style guides, content generators, editing assistants.',
      whyItWorks: [
        'Everyone writes, few write well',
        'AI makes building these easy',
        'Can specialize for high-value niches',
        'Subscription model works well',
      ],
      skillsUsed: ['Writing expertise', 'AI prompting', 'UX design'],
      timeToMvp: '2-4 weeks',
      incomeModel: 'Freemium SaaS, pay-per-use',
      examples: [
        'Email tone optimizer',
        'Blog post outline generator',
        'Legal document simplifier',
        'Resume bullet point improver',
      ],
      firstSteps: [
        'Pick a specific writing challenge',
        'Build AI-powered solution',
        'Test with target users',
        'Iterate on prompts and UX',
      ],
      milestones: [
        { title: 'Pick niche', description: 'Choose specific writing problem' },
        { title: 'Design flow', description: 'Plan user experience' },
        { title: 'Build backend', description: 'Create AI integration' },
        { title: 'Build frontend', description: 'Create user interface' },
        { title: 'Test', description: 'Get user feedback' },
        { title: 'Launch', description: 'Open for business' },
      ],
    },
  },

  // ================================
  // SERVICE PATH
  // ================================
  'service-skills': {
    id: 'service-skills',
    type: 'question',
    title: 'What service could you offer?',
    description: 'Services can generate capital to invest in products later.',
    emoji: '⏱️',
    options: [
      {
        label: 'AI Implementation',
        description: 'Help businesses use AI',
        emoji: '🤖',
        nextNodeId: 'suggest-ai-consulting',
      },
      {
        label: 'Technical Services',
        description: 'Development, automation, data work',
        emoji: '💻',
        nextNodeId: 'suggest-tech-services',
      },
      {
        label: 'Strategy/Consulting',
        description: 'Advise based on your expertise',
        emoji: '🎯',
        nextNodeId: 'suggest-consulting',
      },
    ],
  },

  'suggest-ai-consulting': {
    id: 'suggest-ai-consulting',
    type: 'suggestion',
    title: 'AI Implementation Services',
    emoji: '🤖',
    suggestion: {
      name: 'AI Implementation Consultant',
      tagline: 'Help businesses adopt AI',
      description: 'Businesses want to use AI but dont know how. You can be the bridge: audit their processes, identify AI opportunities, implement solutions.',
      whyItWorks: [
        'Massive demand, limited supply of AI-fluent consultants',
        'High hourly rates ($100-300/hr)',
        'Can productize into templates/courses later',
        'Learning by doing - get paid to build skills',
      ],
      skillsUsed: ['AI tools', 'Business analysis', 'Implementation'],
      timeToMvp: '1 week',
      incomeModel: 'Hourly ($100-300), project-based ($2-20k), retainer',
      examples: [
        'AI audit for small business',
        'ChatGPT workflow implementation',
        'Custom AI tool building',
        'AI training for teams',
      ],
      firstSteps: [
        'Document AI tools you know',
        'Create a simple service offering',
        'Reach out to 10 businesses',
        'Do first project at reduced rate for testimonial',
      ],
      milestones: [
        { title: 'Package service', description: 'Define clear offering and price' },
        { title: 'Create materials', description: 'Sales page, case studies' },
        { title: 'Outreach', description: 'Contact potential clients' },
        { title: 'First client', description: 'Land and complete first project' },
        { title: 'Testimonial', description: 'Get written/video testimonial' },
        { title: 'Scale', description: 'Raise prices, get referrals' },
      ],
    },
  },

  'suggest-tech-services': {
    id: 'suggest-tech-services',
    type: 'suggestion',
    title: 'Technical Services',
    emoji: '💻',
    suggestion: {
      name: 'Freelance Technical Services',
      tagline: 'Solve technical problems for pay',
      description: 'Offer development, automation, data analysis, or other technical services. Build capital while building skills.',
      whyItWorks: [
        'Immediate income',
        'Builds portfolio for products',
        'Learn what people pay for',
        'Networking leads to opportunities',
      ],
      skillsUsed: ['Technical skills', 'Client management', 'Problem-solving'],
      timeToMvp: '1 week',
      incomeModel: 'Hourly ($50-200), project-based',
      examples: [
        'Build websites/apps',
        'Data analysis projects',
        'Automation implementation',
        'System integration',
      ],
      firstSteps: [
        'Define your specific service',
        'Create portfolio (even with personal projects)',
        'List on Upwork/Toptal/direct outreach',
        'Underprice first 3 projects for reviews',
      ],
      milestones: [
        { title: 'Define service', description: 'Choose your offering' },
        { title: 'Build portfolio', description: 'Create sample work' },
        { title: 'Set up profiles', description: 'Freelance platforms + website' },
        { title: 'First client', description: 'Land first paid project' },
        { title: 'Build reviews', description: 'Get 5 star reviews' },
        { title: 'Raise rates', description: 'Increase pricing with experience' },
      ],
    },
  },

  'suggest-consulting': {
    id: 'suggest-consulting',
    type: 'suggestion',
    title: 'Strategy Consulting',
    emoji: '🎯',
    suggestion: {
      name: 'Expert Consulting',
      tagline: 'Monetize your expertise directly',
      description: 'Package your knowledge into consulting services. Help businesses solve problems you understand well.',
      whyItWorks: [
        'Highest hourly rates of any service',
        'Builds authority in your space',
        'Can lead to speaking, courses, products',
        'Flexible schedule',
      ],
      skillsUsed: ['Domain expertise', 'Communication', 'Problem-solving'],
      timeToMvp: '1-2 weeks',
      incomeModel: 'Hourly ($150-500), day rates, retainers',
      examples: [
        'Business strategy sessions',
        'Process optimization',
        'Growth consulting',
        'Operations audits',
      ],
      firstSteps: [
        'Define your expertise clearly',
        'Create one consulting package',
        'Reach out to network',
        'Offer free strategy call as lead gen',
      ],
      milestones: [
        { title: 'Define expertise', description: 'Clarify what you consult on' },
        { title: 'Package', description: 'Create clear service offering' },
        { title: 'Pricing', description: 'Set rates based on value' },
        { title: 'Marketing', description: 'LinkedIn, content, outreach' },
        { title: 'First client', description: 'Close first consulting deal' },
        { title: 'Productize', description: 'Turn learnings into scalable products' },
      ],
    },
  },

  // ================================
  // IMPACT PATH
  // ================================
  'impact-type': {
    id: 'impact-type',
    type: 'question',
    title: 'What kind of impact?',
    description: 'There are many ways to make a difference.',
    emoji: '💫',
    options: [
      {
        label: 'Help individuals',
        description: 'Direct impact on people\'s lives',
        emoji: '🤝',
        nextNodeId: 'suggest-help-individuals',
      },
      {
        label: 'Solve problems at scale',
        description: 'Build something that helps many',
        emoji: '🌍',
        nextNodeId: 'product-skills',
      },
      {
        label: 'Create/teach',
        description: 'Share knowledge, inspire others',
        emoji: '🎓',
        nextNodeId: 'product-communication',
      },
    ],
  },

  'suggest-help-individuals': {
    id: 'suggest-help-individuals',
    type: 'suggestion',
    title: 'Direct Impact Services',
    emoji: '🤝',
    suggestion: {
      name: 'Coaching/Mentoring',
      tagline: 'Help people one-on-one',
      description: 'Use your experience to help others. Coaching, mentoring, or support services create deep impact and good income.',
      whyItWorks: [
        'Immediate, visible impact',
        'High hourly rates possible',
        'Deeply fulfilling work',
        'Can scale into courses/group programs',
      ],
      skillsUsed: ['Empathy', 'Teaching', 'Your experience'],
      timeToMvp: '1 week',
      incomeModel: 'Session-based ($50-300/hr), packages, group programs',
      examples: [
        'Career coaching',
        'Life/mindset coaching',
        'Skill mentoring',
        'Accountability partnership',
      ],
      firstSteps: [
        'Define who you can help most',
        'Offer free sessions to validate',
        'Create simple package',
        'Get testimonials and referrals',
      ],
      milestones: [
        { title: 'Define niche', description: 'Who you help and how' },
        { title: 'Validate', description: 'Free sessions to test' },
        { title: 'Package', description: 'Create coaching offering' },
        { title: 'Price', description: 'Set rates' },
        { title: 'Market', description: 'Find clients' },
        { title: 'Scale', description: 'Group programs or courses' },
      ],
    },
  },

  // ================================
  // SECURITY PATH
  // ================================
  'security-type': {
    id: 'security-type',
    type: 'question',
    title: 'Security through...',
    description: 'There are different paths to financial security.',
    emoji: '🛡️',
    options: [
      {
        label: 'Multiple income streams',
        description: 'Diversify so no single failure hurts',
        emoji: '🔀',
        nextNodeId: 'freedom-type',
      },
      {
        label: 'Build valuable skills',
        description: 'Become so good they can\'t ignore you',
        emoji: '📈',
        nextNodeId: 'product-skills',
      },
      {
        label: 'Steady employment + side project',
        description: 'Job security while building',
        emoji: '⚖️',
        nextNodeId: 'suggest-side-project',
      },
    ],
  },

  'suggest-side-project': {
    id: 'suggest-side-project',
    type: 'suggestion',
    title: 'Side Project Strategy',
    emoji: '⚖️',
    suggestion: {
      name: 'Strategic Side Project',
      tagline: 'Build toward freedom while employed',
      description: 'Keep stable income while building something on the side. When side project income matches salary, you have options.',
      whyItWorks: [
        'Low risk - income is secured',
        'No pressure means better decisions',
        'Compound progress over time',
        'Clear exit criteria',
      ],
      skillsUsed: ['Time management', 'Focus', 'Patience'],
      timeToMvp: 'Variable - part-time progress',
      incomeModel: 'Whatever product model you choose',
      examples: [
        'Weekend SaaS building',
        'Morning content creation',
        'Evening freelance work',
        'Lunch break micro-projects',
      ],
      firstSteps: [
        'Audit your available time',
        'Pick ONE thing to build',
        'Schedule non-negotiable work time',
        'Track progress weekly',
      ],
      milestones: [
        { title: 'Audit time', description: 'Find your available hours' },
        { title: 'Choose project', description: 'Pick ONE thing to focus on' },
        { title: 'Schedule', description: 'Block time every week' },
        { title: 'Build habit', description: 'Show up consistently' },
        { title: 'First revenue', description: 'Any income from project' },
        { title: 'Match salary', description: 'Ultimate exit criteria' },
      ],
    },
  },

  // ================================
  // ADVENTURE PATH
  // ================================
  'adventure-type': {
    id: 'adventure-type',
    type: 'question',
    title: 'Adventure through...',
    description: 'What kind of adventure calls to you?',
    emoji: '🌍',
    options: [
      {
        label: 'Location independence',
        description: 'Work from anywhere in the world',
        emoji: '🗺️',
        nextNodeId: 'suggest-remote-business',
      },
      {
        label: 'Varied projects',
        description: 'New challenges constantly',
        emoji: '🎲',
        nextNodeId: 'service-skills',
      },
      {
        label: 'Building something new',
        description: 'The thrill of creation',
        emoji: '🚀',
        nextNodeId: 'product-skills',
      },
    ],
  },

  'suggest-remote-business': {
    id: 'suggest-remote-business',
    type: 'suggestion',
    title: 'Location Independent Business',
    emoji: '🗺️',
    suggestion: {
      name: 'Digital Nomad Business',
      tagline: 'Work from anywhere, live everywhere',
      description: 'Build a business that runs from a laptop. Products are better than services for travel (less meetings, async work).',
      whyItWorks: [
        'Complete location freedom',
        'Low cost of living arbitrage',
        'Experiences fuel creativity',
        'Growing infrastructure for nomads',
      ],
      skillsUsed: ['Self-discipline', 'Digital skills', 'Adaptability'],
      timeToMvp: 'Variable',
      incomeModel: 'Products preferred, async services possible',
      examples: [
        'SaaS that runs itself',
        'Content/course business',
        'E-commerce with fulfillment',
        'Async consulting',
      ],
      firstSteps: [
        'Pick business model that works async',
        'Build while stationary first',
        'Systemize everything',
        'Test with short trips before going full nomad',
      ],
      milestones: [
        { title: 'Choose model', description: 'Pick location-independent business' },
        { title: 'Build', description: 'Create while stationary' },
        { title: 'Systemize', description: 'Remove yourself from daily ops' },
        { title: 'Test remote', description: 'Work from coffee shops, co-working' },
        { title: 'Short trip', description: '1-2 week remote work test' },
        { title: 'Go nomad', description: 'Full location independence' },
      ],
    },
  },
}

// Helper function to get a node by ID
export function getNode(nodeId: string): TreeNode | undefined {
  return pathFinderTree[nodeId]
}

// Helper function to get all suggestion nodes
export function getAllSuggestions(): TreeNode[] {
  return Object.values(pathFinderTree).filter(node => node.type === 'suggestion')
}

// Helper function to get path from start to a node
export function getPathToNode(targetNodeId: string, visitedNodes: string[]): string[] {
  return visitedNodes.filter(id => pathFinderTree[id])
}

// Helper function to check if a node is a dead end (suggestion)
export function isSuggestion(nodeId: string): boolean {
  const node = pathFinderTree[nodeId]
  return node?.type === 'suggestion'
}
