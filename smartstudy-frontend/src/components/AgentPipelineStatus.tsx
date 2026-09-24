import { Eye, FileCode2, CheckCheck, GraduationCap, ShieldAlert, UserCheck } from 'lucide-react';

interface AgentPipelineStatusProps {
  currentStep?: number; // 1 to 6
  subData?: {
    imageName?: string;
    blocksTranscribed?: number;
    subject?: string;
    qaNote?: string;
    status?: string;
  };
}

export default function AgentPipelineStatus({ currentStep = 6, subData }: AgentPipelineStatusProps) {
  const steps = [
    {
      num: 1,
      name: 'Vision Agent',
      desc: subData?.imageName ? `${subData.imageName} ingested` : 'Handwritten scan & image preprocessing',
      icon: Eye
    },
    {
      num: 2,
      name: 'OCR + Structure Agent',
      desc: subData?.blocksTranscribed 
        ? `${subData.blocksTranscribed} answer blocks transcribed` 
        : 'Transcribes cursive handwriting & maps questions',
      icon: FileCode2
    },
    {
      num: 3,
      name: 'Answer Verification Agent',
      desc: 'Answers checked against rubric & answer key',
      icon: CheckCheck
    },
    {
      num: 4,
      name: 'Subject Grading Agent',
      desc: subData?.subject ? `Graded from ${subData.subject} knowledge base` : 'Evaluates conceptual accuracy & partial marks',
      icon: GraduationCap
    },
    {
      num: 5,
      name: 'QA Agent',
      desc: subData?.qaNote || 'QA verification: Checked grading consistency & hallucinations',
      icon: ShieldAlert
    },
    {
      num: 6,
      name: 'Teacher Review',
      desc: subData?.status === 'approved' ? 'Grades approved by teacher' : 'Awaiting teacher approval',
      icon: UserCheck
    }
  ];

  return (
    <div className="agent-pipeline-card">
      <div className="m-card-header" style={{ marginBottom: '0.75rem' }}>
        <h3 className="m-card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Agent pipeline</span>
        </h3>
        <span className="badge badge-green">
          ● 6 Agents
        </span>
      </div>

      <div className="pipeline-list">
        {steps.map((step) => {
          const isCompleted = currentStep > step.num || (currentStep === 6 && step.num <= 6);
          const isActive = currentStep === step.num;
          const Icon = step.icon;

          return (
            <div 
              key={step.num} 
              className={`pipeline-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
            >
              <div className="pipeline-number">
                {step.num}
              </div>
              <div className="pipeline-text">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icon className="size-3.5 text-slate-500" />
                  <p className="pipeline-name">{step.name}</p>
                </div>
                <p className="pipeline-subtext">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
