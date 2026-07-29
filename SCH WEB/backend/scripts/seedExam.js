import '../config/env.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Exam from '../models/Exam.js';

// One-off smoke-test seed: creates sample published CBT exams using the
// live Exam model (so its validation/hooks run for real), attributed to
// whichever admin/staff account already exists in this database.
const sampleExams = [
  {
    title: 'Sample Mathematics Quiz — Primary 5',
    description: 'A short sample CBT quiz seeded for smoke-testing the exam engine.',
    subject: 'Mathematics',
    division: 'primary',
    classes: ['Grade 5'],
    durationMinutes: 20,
    questions: [
      {
        questionText: 'What is 7 x 8?',
        type: 'mcq',
        options: ['54', '56', '58', '64'],
        correctAnswer: '56',
        marks: 2
      },
      {
        questionText: 'What is the next number in the sequence: 2, 4, 6, 8, ___?',
        type: 'mcq',
        options: ['9', '10', '11', '12'],
        correctAnswer: '10',
        marks: 2
      },
      {
        questionText: 'A rectangle has a length of 10cm and a width of 4cm. What is its area?',
        type: 'mcq',
        options: ['14 cm²', '20 cm²', '40 cm²', '28 cm²'],
        correctAnswer: '40 cm²',
        marks: 3
      },
      {
        questionText: 'In your own words, explain what a prime number is and give one example.',
        type: 'short',
        marks: 3
      }
    ]
  },
  {
    title: 'Sample Colours & Counting Quiz — Nursery',
    description: 'A short sample CBT quiz seeded for smoke-testing the exam engine at nursery level.',
    subject: 'Early Years',
    division: 'nursery',
    classes: [], // whole division — no single nursery class name assumed
    durationMinutes: 10,
    questions: [
      {
        questionText: 'What colour is a banana?',
        type: 'mcq',
        options: ['Red', 'Yellow', 'Blue', 'Purple'],
        correctAnswer: 'Yellow',
        marks: 1
      },
      {
        questionText: 'How many apples are in this sentence: 🍎🍎🍎?',
        type: 'mcq',
        options: ['2', '3', '4', '5'],
        correctAnswer: '3',
        marks: 1
      },
      {
        questionText: 'Which shape has three sides?',
        type: 'mcq',
        options: ['Circle', 'Square', 'Triangle', 'Star'],
        correctAnswer: 'Triangle',
        marks: 1
      },
      {
        questionText: 'What comes after the number 4?',
        type: 'mcq',
        options: ['3', '5', '6', '10'],
        correctAnswer: '5',
        marks: 1
      }
    ]
  },
  {
    title: 'Sample Physics Quiz — JSS 2',
    description: 'A short sample CBT quiz seeded for smoke-testing the exam engine.',
    subject: 'Physics',
    division: 'secondary',
    classes: ['JSS 2'], // matches the seeded student in seedStudents.js
    durationMinutes: 25,
    questions: [
      {
        questionText: 'What is the SI unit of force?',
        type: 'mcq',
        options: ['Watt', 'Newton', 'Joule', 'Pascal'],
        correctAnswer: 'Newton',
        marks: 2
      },
      {
        questionText: 'Which of these is NOT a state of matter?',
        type: 'mcq',
        options: ['Solid', 'Liquid', 'Gas', 'Energy'],
        correctAnswer: 'Energy',
        marks: 2
      },
      {
        questionText: 'A car travels 100km in 2 hours. What is its average speed?',
        type: 'mcq',
        options: ['25 km/h', '50 km/h', '100 km/h', '200 km/h'],
        correctAnswer: '50 km/h',
        marks: 3
      },
      {
        questionText: 'Describe, in your own words, the difference between mass and weight.',
        type: 'short',
        marks: 3
      }
    ]
  },
  {
    title: 'Sample Further Mathematics Quiz — SS 3',
    description: 'A short sample CBT quiz seeded for smoke-testing the exam engine.',
    subject: 'Further Mathematics',
    division: 'college',
    classes: ['SS 3'], // matches the seeded student in seedStudents.js
    durationMinutes: 30,
    questions: [
      {
        questionText: 'What is the derivative of x² with respect to x?',
        type: 'mcq',
        options: ['x', '2x', 'x²', '2x²'],
        correctAnswer: '2x',
        marks: 3
      },
      {
        questionText: 'What is log₁₀(100)?',
        type: 'mcq',
        options: ['1', '2', '10', '100'],
        correctAnswer: '2',
        marks: 2
      },
      {
        questionText: 'Solve for x: 2x + 5 = 15',
        type: 'mcq',
        options: ['5', '10', '7.5', '2.5'],
        correctAnswer: '5',
        marks: 3
      },
      {
        questionText: 'Explain, with an example, what it means for a function to be continuous at a point.',
        type: 'essay',
        marks: 5
      }
    ]
  }
];

const seedExam = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const author = await User.findOne({ role: { $in: ['admin', 'staff'] } });
    if (!author) {
      console.error('No admin/staff user found in this database — cannot set createdBy. Create an admin account first.');
      return;
    }

    for (const sample of sampleExams) {
      const existing = await Exam.findOne({ title: sample.title });
      if (existing) {
        console.log(`Already exists, skipping: ${sample.title} (${existing._id})`);
        continue;
      }

      const now = new Date();
      const exam = await Exam.create({
        ...sample,
        startTime: now,
        endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // open for a week
        shuffleQuestions: false,
        showResultsImmediately: true,
        isPublished: true,
        createdBy: author._id
      });

      console.log('Sample exam created:');
      console.log(`  _id: ${exam._id}`);
      console.log(`  title: ${exam.title}`);
      console.log(`  division/classes: ${exam.division} / ${exam.classes.join(', ') || '(whole division)'}`);
      console.log(`  questions: ${exam.questions.length}, totalMarks: ${exam.totalMarks}`);
      console.log(`  window: ${exam.startTime.toISOString()} -> ${exam.endTime.toISOString()}`);
      console.log(`  createdBy: ${author.email || author.phone} (${author.role})`);
    }
  } catch (error) {
    console.error('Error seeding exam:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

seedExam();

export default seedExam;
