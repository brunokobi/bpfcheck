import React from "react";

const PoliticaPrivacidade = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mb-8 font-italic">Última atualização: 28 de Fevereiro de 2026</p>

        <div className="space-y-6 text-gray-700">
          <p>
            O aplicativo <strong>BPF Check</strong> ("nós", "nosso", "app") valoriza a privacidade dos seus usuários. Esta Política de Privacidade descreve como coletamos, usamos, compartilhamos e protegemos as suas informações pessoais quando você utiliza o nosso sistema especializado em auditoria e checklists de Boas Práticas de Fabricação.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Coleta de Informações</h2>
            <p className="mb-2">Ao utilizar o BPF Check, podemos coletar os seguintes tipos de informações:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Dados de Conta:</strong> Informações fornecidas no momento do cadastro ou login, que podem incluir nome, e-mail e credenciais de acesso.</li>
              <li><strong>Dados de Uso:</strong> Informações sobre como você interage com o aplicativo, como checklists preenchidos, horários de auditoria e configurações de preferências.</li>
              <li><strong>Dados do Dispositivo:</strong> O aplicativo pode solicitar permissões de acesso à câmera ou à galeria do dispositivo exclusivamente para a anexação de evidências fotográficas nas auditorias de Boas Práticas de Fabricação.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Uso das Informações</h2>
            <p className="mb-2">As informações coletadas são utilizadas para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fornecer, operar e manter o funcionamento do aplicativo;</li>
              <li>Melhorar, personalizar e expandir os recursos do sistema de checklists;</li>
              <li>Processar suas auditorias e gerar os relatórios adequados;</li>
              <li>Fornecer suporte técnico e responder a solicitações.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Compartilhamento de Informações</h2>
            <p>Nós não vendemos, trocamos ou alugamos as informações pessoais dos usuários para terceiros. O compartilhamento de dados pode ocorrer apenas em casos de exigência legal ou para proteger nossos direitos e a segurança dos usuários.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Segurança dos Dados</h2>
            <p>Implementamos medidas de segurança adequadas para proteger contra acesso não autorizado, alteração, divulgação ou destruição de suas informações pessoais e dados de auditoria armazenados no aplicativo. No entanto, lembre-se de que nenhum método de transmissão pela internet ou método de armazenamento eletrônico é 100% seguro.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Seus Direitos</h2>
            <p>Você tem o direito de acessar, corrigir ou excluir suas informações pessoais a qualquer momento. Caso deseje encerrar sua conta e remover seus dados de nossos servidores, entre em contato conosco.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Contato</h2>
            <p className="mb-2">Se você tiver alguma dúvida ou sugestão sobre a nossa Política de Privacidade, não hesite em nos contatar:</p>
            <ul className="list-disc pl-5">
              <li><strong>Desenvolvedor:</strong> Bruno Kobi</li>
              <li><strong>E-mail:</strong> brunokobi@gmail.com</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PoliticaPrivacidade;