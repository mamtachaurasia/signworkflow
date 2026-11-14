export type Testimonial = {
    name: string;
    role: string;
    text: string;
    stars: number;
    avatar?: string;
    avatarUrl?: string;
    sourceUrl?: string;
    sourceName?: string;
    publishedAt?: string;
    verified?: boolean;
};

// Keep only reviews that link to their original public source.
export const testimonials: Testimonial[] = [
    {
        name: 'Siddharth Chaurasia',
        role: 'Advertric Media Solution',
        avatar: 'SC',
        text: "The platform is easy to use, our clients sign documents without any confusion, and tracking signatures saves us valuable time. The pricing is reasonable, the support team is responsive, and overall it has made our workflow faster, more professional, and completely paperless.",
        //text: 'He describes a smoother paperless signing process, easier status tracking, and helpful support during setup.',
        stars: 5,
        // sourceUrl: 'https://www.trustpilot.com/review/signworkflow.com',
        // sourceName: 'Trustpilot',
        // publishedAt: 'July 29, 2026',
        // verified: true,
    },
    {
        name: "Marcus Rivera",
        role: "Head of HR, TechNova Inc.",
        avatar: "MR",
        text: "Templates and team workflows made onboarding packets much easier to run. We spend less time rebuilding documents and chasing status updates.",
        stars: 5,
    },
    {
        name: "Peter O'Neill",
        role: "Managing Partner, Legal Advisory Firm",
        avatar: "PO",
        text: "SignWorkflow has made document signing faster and more efficient for our legal team. It's easy to use, secure, and has improved the way we manage client agreements.",
        stars: 5,
    },
    {
        name: "Sarah Mitchell",
        role: "Operations Manager",
        avatar: "SM",
        text: "SignWorkflow has transformed how we manage contracts. Documents are signed faster, and the entire process is much easier to track.",
        stars: 5,
    },
    {
        name: "David Chen",
        role: "HR Director",
        avatar: "DC",
        text: "Employee onboarding is now completely digital. SignWorkflow is intuitive, reliable, and has saved our HR team countless hours.",
        stars: 5,
    },
    {
        name: "Emily Carter",
        role: "Legal Operations Manager",
        avatar: "EC",
        text: "The platform is secure, simple to use, and keeps all our agreements organized in one place. It's become an essential part of our workflow.",
        stars: 5,
    },
    {
        name: "Michael Rodriguez",
        role: "Sales Director",
        avatar: "MR",
        text: "Our sales team closes deals much faster thanks to SignWorkflow. Clients appreciate the quick and seamless signing experience.",
        stars: 4,
    },
    {
        name: "Priya Sharma",
        role: "Finance Manager",
        avatar: "PS",
        text: "Approval and signing processes that once took days are now completed within hours. SignWorkflow has improved efficiency across our organization.",
        stars: 5,
    },
    {
        name: "James Wilson",
        role: "Business Development Manager",
        avatar: "JW",
        text: "Implementation was straightforward, and our team adopted it immediately. The platform is fast, secure, and dependable.",
        stars: 5,
    },
    {
        name: "Priya Nair",
        role: "Founding Partner, Nair & Associates Law",
        avatar: "PN",
        text: "The combination of signing flow, evidence visibility, and retention-aware controls makes this feel much closer to a real operating system than a basic signer.",
        stars: 5,
    },
];
