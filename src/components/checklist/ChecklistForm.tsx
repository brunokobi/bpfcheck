import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, Save, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChecklistItem {
  id: string;
  text: string;
  section: string;
  status: "conforme" | "nao_conforme" | "nao_aplicavel" | null;
  observations: string;
  photos: string[];
}

interface ChecklistFormProps {
  onBack: () => void;
  onSave: () => void;
}

const RDC_216_ITEMS: ChecklistItem[] = [
  {
    id: "1.1",
    text: "As instalações são isentas de focos de insalubridade, não existem focos de contaminação e não oferecem riscos à saúde dos manipuladores de alimentos?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.2",
    text: "O acesso direto e independente é garantido, não comum a outros usos (habitação)?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.3",
    text: "As áreas para recepção e depósito de matéria-prima, ingredientes e embalagens são distintas das áreas de produção, armazenamento e expedição de produto final?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.4",
    text: "O piso é liso, impermeável, lavável, de fácil higienização e encontra-se em bom estado de conservação?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.5",
    text: "As paredes e divisórias são lisas, impermeáveis, laváveis, de cores claras e encontram-se em bom estado de conservação (sem rachaduras, umidade ou descascamento)?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.6",
    text: "Os tetos são lisos, impermeáveis, laváveis, de cores claras e encontram-se em bom estado de conservação (sem infiltrações, umidade ou mofo)?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.7",
    text: "As portas são lisas, laváveis, de fácil higienização, com fechamento automático e com barreiras protetoras contra insetos e roedores (se aplicável)?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.8",
    text: "As janelas são providas de telas milimétricas para proteção contra insetos, de fácil remoção para limpeza e em bom estado de conservação?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.9",
    text: "A iluminação é adequada, uniforme e não altera as características sensoriais dos alimentos (cor, odor)?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.10",
    text: "As luminárias estão protegidas contra estilhaçamento?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.11",
    text: "A ventilação é suficiente para renovar o ar e evitar o acúmulo de calor e vapores, sem causar contaminação cruzada?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.12",
    text: "As instalações sanitárias (banheiros e vestiários) são separadas das áreas de manipulação de alimentos e estão em bom estado de conservação e higiene?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.13",
    text: "Existem lavatórios para as mãos nas áreas de manipulação, com água corrente, sabonete líquido antisséptico ou sabonete e antisséptico, toalhas de papel não reciclável ou secador elétrico e lixeira com acionamento não manual?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.14",
    text: "Os equipamentos e móveis são lisos, impermeáveis, laváveis, não oxidáveis e em bom estado de conservação e higiene?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.15",
    text: "Os utensílios são de material adequado, lisos, impermeáveis, laváveis, não oxidáveis e em bom estado de conservação e higiene?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "1.16",
    text: "Existe área específica para higienização de utensílios e equipamentos?",
    section: "Edificação, Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },

  // 2. Abastecimento de Água
  {
    id: "2.1",
    text: "A água utilizada para o preparo dos alimentos e para a higienização é potável e em quantidade suficiente?",
    section: "Abastecimento de Água",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "2.2",
    text: "Há um sistema de tratamento de água próprio, se a água não for proveniente de rede pública, e é comprovada a sua potabilidade por laudos de análise?",
    section: "Abastecimento de Água",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "2.3",
    text: "Os reservatórios de água são limpos e desinfetados periodicamente, com registros que comprovem essas ações?",
    section: "Abastecimento de Água",
    status: null,
    observations: "",
    photos: []
  },

  // 3. Esgotamento Sanitário e Resíduos Sólidos
  {
    id: "3.1",
    text: "O sistema de esgoto está ligado à rede pública ou possui sistema individual devidamente licenciado pelos órgãos competentes?",
    section: "Esgotamento Sanitário e Resíduos Sólidos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "3.2",
    text: "As caixas de gordura e ralos sifonados estão limpos e em bom estado de conservação?",
    section: "Esgotamento Sanitário e Resíduos Sólidos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "3.3",
    text: "O descarte de resíduos sólidos é realizado em recipientes com tampas e revestidos de sacos plásticos, em local apropriado e com frequência adequada?",
    section: "Esgotamento Sanitário e Resíduos Sólidos",
    status: null,
    observations: "",
    photos: []
  },

  // 4. Manipulação de Alimentos
  {
    id: "4.1",
    text: "A recepção de matérias-primas, ingredientes e embalagens é realizada em área protegida e limpa?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.2",
    text: "São adotados critérios para avaliação e seleção dos fornecedores de matérias-primas, ingredientes e embalagens?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.3",
    text: "O transporte de matérias-primas e ingredientes é realizado em condições adequadas de higiene e conservação?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.4",
    text: "O armazenamento de matérias-primas, ingredientes e produtos acabados é feito em locais secos, limpos, arejados e protegidos de pragas e contaminação cruzada?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.5",
    text: "Os alimentos são armazenados em estrados ou prateleiras, distantes do chão e das paredes?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.6",
    text: "O sistema 'primeiro que entra, primeiro que sai' (PEPS) é aplicado para garantir a rotatividade dos estoques?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.7",
    text: "A dessalgue de carnes é realizada sob refrigeração ou em água corrente?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.8",
    text: "A descongelamento de alimentos é feita em refrigerador, forno de micro-ondas ou sob água corrente fria?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.9",
    text: "A manipulação de alimentos crus é realizada em áreas ou bancadas separadas dos alimentos prontos para o consumo, para evitar contaminação cruzada?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.10",
    text: "A cocção dos alimentos atinge as temperaturas e tempos adequados para garantir a eliminação de microrganismos patogênicos?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.11",
    text: "O resfriamento e o reaquecimento dos alimentos são realizados de forma rápida e segura, evitando a zona de perigo de temperatura?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.12",
    text: "Os alimentos quentes são mantidos acima de 60°C e os alimentos frios abaixo de 5°C durante a distribuição?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "4.13",
    text: "A exposição de alimentos para consumo imediato é feita em equipamentos que mantenham as temperaturas adequadas (estufas, balcões refrigerados)?",
    section: "Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },

  // 5. Higienização das Instalações, Equipamentos, Móveis e Utensílios
  {
    id: "5.1",
    text: "Existe um Programa de Higienização documentado, com os procedimentos, frequência, produtos utilizados e responsável?",
    section: "Higienização das Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "5.2",
    text: "Os produtos saneantes são registrados na ANVISA e utilizados de acordo com as instruções do fabricante?",
    section: "Higienização das Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "5.3",
    text: "Os utensílios e equipamentos são higienizados antes e após cada uso, ou sempre que necessário?",
    section: "Higienização das Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "5.4",
    text: "As áreas de manipulação são higienizadas após cada turno de trabalho ou sempre que necessário?",
    section: "Higienização das Instalações, Equipamentos, Móveis e Utensílios",
    status: null,
    observations: "",
    photos: []
  },

  // 6. Controle Integrado de Vetores e Pragas Urbanas
  {
    id: "6.1",
    text: "Existe um Programa de Controle Integrado de Vetores e Pragas Urbanas, com ações preventivas e corretivas?",
    section: "Controle Integrado de Vetores e Pragas Urbanas",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "6.2",
    text: "São adotadas medidas para evitar o acesso de pragas, como telas, portas com fechamento automático e vedação de frestas?",
    section: "Controle Integrado de Vetores e Pragas Urbanas",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "6.3",
    text: "A aplicação de produtos químicos é realizada por empresa especializada e licenciada, com registro dos produtos utilizados?",
    section: "Controle Integrado de Vetores e Pragas Urbanas",
    status: null,
    observations: "",
    photos: []
  },

  // 7. Manipuladores
  {
    id: "7.1",
    text: "Os manipuladores possuem atestado de saúde ocupacional (ASO) atualizado e são submetidos a exames periódicos?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "7.2",
    text: "Os manipuladores recebem capacitação em higiene pessoal, manipulação de alimentos e doenças transmitidas por alimentos (DTAs)?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "7.3",
    text: "Os manipuladores utilizam uniformes limpos e adequados para a atividade, incluindo toucas, aventais e sapatos fechados?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "7.4",
    text: "As mãos dos manipuladores são lavadas e higienizadas adequadamente antes de iniciar as atividades, após usar o banheiro, após tossir/espirrar, após manusear lixo, após manusear alimentos crus e sempre que necessário?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "7.5",
    text: "Os manipuladores que apresentam lesões nas mãos, diarreia, vômito ou outras doenças transmissíveis são afastados da manipulação de alimentos?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "7.6",
    text: "É proibido fumar, tossir, espirrar sobre os alimentos, comer, beber ou mascar goma nas áreas de manipulação?",
    section: "Manipuladores",
    status: null,
    observations: "",
    photos: []
  },

  // 8. Responsável pelas Atividades de Manipulação de Alimentos
  {
    id: "8.1",
    text: "Existe um responsável pela operação devidamente capacitado e com comprovante de capacitação em Boas Práticas de Manipulação de Alimentos?",
    section: "Responsável pelas Atividades de Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "8.2",
    text: "O responsável supervisiona as atividades de manipulação, garantindo o cumprimento das Boas Práticas?",
    section: "Responsável pelas Atividades de Manipulação de Alimentos",
    status: null,
    observations: "",
    photos: []
  },

  // 9. Documentação e Registro
  {
    id: "9.1",
    text: "O estabelecimento possui o Manual de Boas Práticas de Manipulação de Alimentos (MBPMA) atualizado?",
    section: "Documentação e Registro",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "9.2",
    text: "Existem Procedimentos Operacionais Padronizados (POPs) específicos para cada etapa da manipulação de alimentos (higienização de instalações, equipamentos, controle de pragas, controle de saúde dos manipuladores, etc.)?",
    section: "Documentação e Registro",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "9.3",
    text: "Os POPs estão disponíveis para os manipuladores e são de fácil compreensão?",
    section: "Documentação e Registro",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "9.4",
    text: "São mantidos registros das ações de controle (temperaturas, higienização, controle de pragas, capacitação de manipuladores, etc.)?",
    section: "Documentação e Registro",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "9.5",
    text: "Os registros são de fácil acesso e estão disponíveis para a fiscalização?",
    section: "Documentação e Registro",
    status: null,
    observations: "",
    photos: []
  },

  // 10. Controle de Qualidade (Alimentos)
  {
    id: "10.1",
    text: "Existe controle da qualidade das matérias-primas, ingredientes e embalagens, com verificação de procedência, data de validade e condições de armazenamento?",
    section: "Controle de Qualidade (Alimentos)",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "10.2",
    text: "Existe controle da qualidade do produto final, com monitoramento de temperaturas, tempo de exposição e características sensoriais?",
    section: "Controle de Qualidade (Alimentos)",
    status: null,
    observations: "",
    photos: []
  },
  {
    id: "10.3",
    text: "São realizadas análises laboratoriais (físico-químicas e microbiológicas) dos alimentos e/ou água, se aplicável, por laboratórios credenciados?",
    section: "Controle de Qualidade (Alimentos)",
    status: null,
    observations: "",
    photos: []
  },
];

export const ChecklistForm = ({ onBack, onSave }: ChecklistFormProps) => {
  const [items, setItems] = useState<ChecklistItem[]>(RDC_216_ITEMS);
  const [currentSection, setCurrentSection] = useState(0);
  const { toast } = useToast();

  const sections = Array.from(new Set(items.map(item => item.section)));
  const currentSectionItems = items.filter(item => item.section === sections[currentSection]);
  
  const calculateProgress = () => {
    const completedItems = items.filter(item => item.status !== null).length;
    return (completedItems / items.length) * 100;
  };

  const updateItemStatus = (itemId: string, status: ChecklistItem["status"]) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, status } : item
    ));
  };

  const updateItemObservations = (itemId: string, observations: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, observations } : item
    ));
  };

  const handleTakePhoto = (itemId: string) => {
    toast({
      title: "Funcionalidade de Câmera",
      description: "Para usar a câmera, este app pode ser convertido para mobile com Capacitor.",
    });
  };

  const handleSave = () => {
    toast({
      title: "Checklist Salvo",
      description: "Seu progresso foi salvo com sucesso.",
    });
    onSave();
  };

  const getStatusColor = (status: ChecklistItem["status"]) => {
    switch (status) {
      case "conforme":
        return "bg-success text-success-foreground";
      case "nao_conforme":
        return "bg-destructive text-destructive-foreground";
      case "nao_aplicavel":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary">Checklist RDC 216/2004</h1>
            <p className="text-muted-foreground">Regulamento Técnico de Boas Práticas</p>
          </div>
        </div>
        <Button onClick={handleSave} className="bg-gradient-primary">
          <Save className="w-4 h-4 mr-2" />
          Salvar Progresso
        </Button>
      </div>

      {/* Progress */}
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso do Checklist</span>
              <span>{Math.round(calculateProgress())}% concluído</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Section Navigation */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-primary">
          {sections[currentSection]}
        </h2>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => setCurrentSection(prev => Math.max(0, prev - 1))}
            disabled={currentSection === 0}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            {currentSection + 1} de {sections.length}
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentSection(prev => Math.min(sections.length - 1, prev + 1))}
            disabled={currentSection === sections.length - 1}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-4">
        {currentSectionItems.map((item) => (
          <Card key={item.id} className="shadow-card">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">{item.id}</CardTitle>
                  <CardDescription className="mt-2">{item.text}</CardDescription>
                </div>
                <Badge className={getStatusColor(item.status)}>
                  {item.status === "conforme" ? "Conforme" :
                   item.status === "nao_conforme" ? "Não Conforme" :
                   item.status === "nao_aplicavel" ? "Não Aplicável" : "Pendente"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Options */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`${item.id}-conforme`}
                    checked={item.status === "conforme"}
                    onCheckedChange={(checked) => 
                      updateItemStatus(item.id, checked ? "conforme" : null)
                    }
                  />
                  <label htmlFor={`${item.id}-conforme`} className="text-sm font-medium text-success">
                    Conforme
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`${item.id}-nao-conforme`}
                    checked={item.status === "nao_conforme"}
                    onCheckedChange={(checked) => 
                      updateItemStatus(item.id, checked ? "nao_conforme" : null)
                    }
                  />
                  <label htmlFor={`${item.id}-nao-conforme`} className="text-sm font-medium text-destructive">
                    Não Conforme
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`${item.id}-nao-aplicavel`}
                    checked={item.status === "nao_aplicavel"}
                    onCheckedChange={(checked) => 
                      updateItemStatus(item.id, checked ? "nao_aplicavel" : null)
                    }
                  />
                  <label htmlFor={`${item.id}-nao-aplicavel`} className="text-sm font-medium text-muted-foreground">
                    Não Aplicável
                  </label>
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  value={item.observations}
                  onChange={(e) => updateItemObservations(item.id, e.target.value)}
                  placeholder="Adicione observações relevantes..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Photo Button */}
              <Button
                variant="outline"
                onClick={() => handleTakePhoto(item.id)}
                className="w-full"
              >
                <Camera className="w-4 h-4 mr-2" />
                Adicionar Foto
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};