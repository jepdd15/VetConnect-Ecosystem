/** Fixed category list for FAQ entries. Used by admin tabs and mobile prompt grouping. */
export const FAQ_CATEGORIES = ['General', 'Services', 'Pricing', 'Policies', 'Pet Care'];

/** Default FAQ entries seeded on first use when the faqs collection is empty. */
export const DEFAULT_FAQS = [
  {
    category: 'General',
    question: 'Do I need an appointment or can I walk in?',
    answer:
      'We accept both scheduled appointments and walk-ins. Appointments are recommended to minimize wait times, but walk-ins are always welcome.',
  },
  {
    category: 'General',
    question: 'What animals do you treat?',
    answer:
      'We primarily treat dogs and cats. For exotic pets, please call the clinic to confirm availability.',
  },
  {
    category: 'Pricing',
    question: 'Do you offer payment plans?',
    answer:
      'We accept cash and GCash payments. Please contact the clinic directly to discuss payment arrangements for larger procedures.',
  },
  {
    category: 'Policies',
    question: 'What is your cancellation policy?',
    answer:
      'Please cancel or reschedule at least 2 hours before your appointment time. Repeated no-shows may affect future booking priority.',
  },
  {
    category: 'Pet Care',
    question: 'How often should I bring my pet for a checkup?',
    answer:
      'We recommend annual wellness checkups for adult pets and bi-annual visits for senior pets (7+ years for dogs, 10+ years for cats).',
  },
  {
    category: 'Services',
    question: 'Do you offer grooming services?',
    answer:
      'Yes! We offer full grooming services including bath, haircut, nail trimming, and ear cleaning. Check our Services section for current pricing.',
  },
  {
    category: 'Policies',
    question: "Is my pet's medical data private?",
    answer:
      "Yes. We comply with RA 10173 (Data Privacy Act). Your pet's medical records and your personal information are protected. You may request data access or erasure at any time.",
  },
  {
    category: 'Pet Care',
    question: 'What vaccinations does my puppy need?',
    answer:
      'Puppies need a series of core vaccines (5-in-1/DHPP and anti-rabies) starting at 6-8 weeks. Your vet will create a personalized vaccination schedule during your first visit.',
  },
];
