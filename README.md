# Autômatos Finitos

De expressão regular a AFD mínimo, passo a passo, direto no navegador. A página mostra cada etapa da conversão que cai na prova de Linguagens Formais (AFN-ε de Thompson, AFN sem ε, AFD por subconjuntos e AFD mínimo), sempre com o grafo e a tabela de transições, e ainda simula palavras, testa equivalência com contraexemplo, faz complemento, união e interseção e volta de autômato para expressão regular por eliminação de estados.

**Acesse online:** https://micdog22.github.io/automatos-finitos/

## Recursos

- **Expressões de sala de aula**: união com `|` ou `+` (você escolhe), concatenação, `*`, `?`, parênteses, `ε` ou `&` para a palavra vazia e `∅` para a linguagem vazia. Erros mostram a posição com um `^`.
- **Etapas visíveis**, cada uma com grafo e tabela:
  1. AFN-ε pela construção de Thompson;
  2. AFN sem ε, com a tabela de fechos-ε;
  3. AFD pela construção de subconjuntos, com o conjunto de cada estado;
  4. AFD mínimo, com as partições de cada rodada e a tabela de pares distinguíveis.
- **Grafos de verdade**: layout em camadas, transições curvas, laços, seta no inicial, círculo duplo nos finais, estado morto que pode ser escondido, e estados **arrastáveis** com o mouse, o dedo ou as setas do teclado.
- **Simulação passo a passo** de uma palavra em qualquer etapa (ou no editor), destacando os estados ativos; em AFN, o conjunto inteiro.
- **Editor de autômatos** (AFD, AFN ou AFN-ε) em texto simples, com importação e exportação em JSON.
- **Operações**: equivalência com o menor contraexemplo, complemento, união e interseção pela construção do produto.
- **De volta para expressão regular** por eliminação de estados, com cada passo e uma conferência automática de que a expressão obtida aceita exatamente as mesmas palavras.
- **Link para compartilhar** a expressão e o autômato do editor; o que você digitou fica salvo no navegador.

## Como usar

Digite uma expressão, como `(a|b)*abb` (palavras sobre {a, b} que terminam em abb). As quatro etapas aparecem na hora:

- **AFN-ε**: 11 estados e 13 transições (8 com ε);
- **AFN sem ε**: 6 estados (q1, q2, q3, q4 e q9 só eram alcançados por ε e saem);
- **AFD**: 5 estados, A a E, cada um com o seu conjunto de estados do AFN;
- **AFD mínimo**: 4 estados. As partições mostram o porquê:

  ```
  0. {A, B, C, D} {E}   (finais e não finais)
  1. {A, B, C} {D} {E}
  2. {A, C} {B} {D} {E}
  3. Nada mudou: cada bloco vira um estado do AFD mínimo.
  ```

  A e C nunca foram separados, então viram um estado só (`A,C`).

Em **Simular uma palavra**, escolha a etapa, digite a palavra e use Avançar ou Fim para ver os estados ativos a cada símbolo.

O **editor** usa uma transição por linha:

```
# AFN: palavras que contêm ab
inicial q0
finais q2
q0 a,b q0
q0 a q1
q1 b q2
q2 a,b q2
```

Com esse autômato em B, **A e B são equivalentes?** responde: "Não são equivalentes: a palavra "ab" é aceita por B e rejeitada por A (é o menor contraexemplo)". E **Eliminar estados de B** devolve `(a|b)*ab(a|b)*`, conferida contra o próprio autômato.

Para um AFD que reconhece números binários múltiplos de 3 (os restos 0, 1 e 2 como estados), a eliminação de estados chega na resposta clássica:

```
Eliminando q2 (laço: 1): q1 → q1: 01*0
Eliminando q1 (laço: 01*0): q0 → q0: 0|1(01*0)*1
Eliminando q0 (laço: 0|1(01*0)*1): início → fim: (0|1(01*0)*1)*
```

O JSON exportado tem este formato (também aceito na importação):

```json
{
  "tipo": "AFD",
  "alfabeto": ["a", "b"],
  "estados": ["A,C", "B", "D", "E"],
  "inicial": "A,C",
  "finais": ["E"],
  "transicoes": [{ "de": "A,C", "simbolo": "a", "para": "B" }]
}
```

## Como rodar localmente

Não há dependências nem etapa de build. Como a página usa módulos JavaScript, ela precisa ser servida por HTTP:

```
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Testes

```
npm test
```

(ou `node --test`). Os testes cobrem:

- **Thompson**: a quantidade de estados de várias expressões (11 para `(a|b)*abb`, como no livro de Aho, Lam, Sethi e Ullman) e a fórmula de contagem conferida em 200 expressões aleatórias, além de inicial sem entradas e final sem saídas;
- **subconjuntos**: o exemplo clássico de `(a|b)*abb` (estados A a E, com os tamanhos dos conjuntos e a tabela de transições do livro) e a explosão exponencial (penúltimo símbolo é 1 dá 4 estados; antepenúltimo dá 8, todos necessários);
- **remoção de ε**: sobram o inicial e um estado por ocorrência de símbolo;
- **minimização**: quantidades de estados, as partições de cada rodada e os pares distinguíveis, e um AFD redundante de 6 estados para múltiplos de 3 que vira 3;
- **todas as etapas aceitam as mesmas palavras**: AFN-ε, AFN, AFD e mínimo concordam em todas as palavras de até 8 símbolos para várias expressões;
- **equivalência** com contraexemplos (o menor, inclusive a palavra vazia) e alfabetos diferentes;
- **complemento, união e interseção** conferidos palavra a palavra contra a definição;
- **eliminação de estados**: a expressão obtida aceita exatamente as mesmas palavras que o autômato, para todas as palavras de até 8 símbolos, em AFDs, AFDs mínimos e um AFN com ε;
- leitura de expressões (precedência, `+` configurável, escapes, erros com posição), simplificação, editor em texto, JSON e o desenho (nenhum estado sobreposto, uma curva por par de estados, laços, abreviação de nomes longos).

## Como funciona

### Expressões regulares

A leitura é um analisador descendente recursivo com três níveis de precedência: união (a menor), concatenação e os operadores pós-fixos `*`, `?` e `+` (a maior). Assim `ab|c*` é `(ab)|(c*)`. Com a união em `|`, `+` significa "uma ou mais vezes"; com a união em `+` (a notação de muitos livros), `+` e `|` são união.

### 1. Construção de Thompson

Cada pedaço da expressão vira um pequeno AFN com um início e um fim:

- um símbolo `a`: dois estados ligados por `a`;
- união `r|s`: um início novo com ε para os inícios de r e de s, e os fins dos dois com ε para um fim novo;
- estrela `r*`: início e fim novos; ε do início para r e para o fim (zero repetições), e do fim de r de volta para o início de r e para o fim;
- concatenação `rs`: o fim de r e o início de s viram um único estado.

Como o início de um pedaço nunca recebe transições e o fim nunca tem saídas, essa fusão é sempre segura. Daí sai uma fórmula: são 2 estados por símbolo, ε, `∅`, união, `*`, `?` e `+`, menos 1 por concatenação. Para `(a|b)*abb`: 5 símbolos, 1 união e 1 estrela dão 14, menos 3 concatenações, 11 estados.

### 2. Removendo as transições ε

O **fecho-ε** de q é o conjunto de estados alcançáveis a partir de q só com transições ε (incluindo o próprio q). Sem ε, de q lendo `a` vai-se para δ(fecho(q), a), ou seja, primeiro anda por ε e depois lê o símbolo; e q é final se o fecho dele tem algum final. O fecho depois da leitura não se perde: ele é aplicado no passo seguinte, a partir do novo estado.

Muitos estados só eram alcançados por ε e ficam sem uso; tirando os inalcançáveis, sobram o inicial e um estado para cada ocorrência de símbolo na expressão. Esse é o **autômato de posições** (de Glushkov): para `(a|b)*abb`, 1 + 5 = 6 estados.

### 3. Construção de subconjuntos

Um AFN pode estar em vários estados ao mesmo tempo; o AFD guarda **o conjunto** inteiro como um estado só. O inicial é o fecho-ε do inicial do AFN; de um conjunto T, lendo `a`, vai para o conjunto de todos os destinos de `a` a partir de T (com fecho-ε). Conjuntos novos entram numa fila até não aparecer nenhum. Um conjunto é final se contém algum final do AFN.

No pior caso o AFD tem 2^n estados. O exemplo clássico é "o k-ésimo símbolo a partir do fim é 1": o AFN tem k + 1 estados e o AFD precisa de 2^k, porque tem que lembrar os últimos k símbolos. Os testes conferem k = 2 (4 estados) e k = 3 (8).

### 4. Minimização

Dois estados são **equivalentes** se, para toda palavra, os dois aceitam ou os dois rejeitam. O algoritmo descobre quem **não** é equivalente, rodada a rodada:

1. o AFD é completado com um estado morto (`∅`) onde faltar transição, e os inalcançáveis saem;
2. a rodada 0 separa finais de não finais (a palavra vazia já distingue os dois grupos);
3. em cada rodada, dois estados do mesmo bloco só continuam juntos se, para todo símbolo, vão para o mesmo bloco;
4. quando uma rodada não muda nada, cada bloco vira um estado do AFD mínimo.

É a versão em partições do **algoritmo de preenchimento de tabela**: a tabela de pares na página mostra em que rodada cada par foi separado (o par foi separado na rodada k se existe uma palavra de tamanho k que distingue os dois). Pelo teorema de Myhill-Nerode, o AFD mínimo completo é único (a menos dos nomes dos estados).

### Simulação

Em um AFD há um estado ativo por vez. Em um AFN, o conjunto de estados ativos começa com o fecho-ε do inicial e, a cada símbolo, vira o fecho-ε de todos os destinos possíveis. Se o conjunto fica vazio, a palavra morreu. No fim, a palavra é aceita se algum estado ativo é final.

### Equivalência, complemento, união e interseção

Todas usam AFDs completos sobre o mesmo alfabeto (a união dos alfabetos dos dois lados).

- **Produto**: os estados são pares (p; q); lendo `a`, o par vai para (δA(p, a); δB(q, a)). Só os pares alcançáveis a partir do par inicial são construídos. Na **união**, o par é final se p ou q for; na **interseção**, se os dois forem.
- **Equivalência**: busca em largura nos pares alcançáveis; se algum par tem um final e um não final, a palavra que leva até ele é aceita por um lado e rejeitada pelo outro. Por ser em largura, é o **menor contraexemplo**.
- **Complemento**: troca finais e não finais. Só funciona com o AFD **completo**: sem o estado morto, as palavras que "morrem" continuariam rejeitadas. E depende do alfabeto: o complemento de `a*` sobre {a} é vazio, mas sobre {a, b} contém b.

### De volta para expressão regular: eliminação de estados

1. Acrescente um **início** novo com ε para o inicial e um **fim** novo, com ε saindo de cada final.
2. Troque os rótulos das transições por expressões (várias transições entre os mesmos estados viram uma união).
3. Elimine os estados originais um a um. Ao eliminar k, cada caminho p → k → q vira

   ```
   R(p, q) | R(p, k) R(k, k)* R(k, q)
   ```

4. Sobra só a transição início → fim, com a expressão da linguagem.

A ordem não muda a linguagem, mas muda o tamanho da expressão: a página elimina primeiro o estado com menos combinações de entrada e saída. A cada passo a expressão é simplificada sem mudar a linguagem (`∅` some de uniões e anula concatenações, `ε` some de concatenações, `(r*)* = r*`, `ε | r* = r*`, `(x x*)? = x*`). No fim, a página converte a expressão obtida de volta em autômato e confere a equivalência com o original.

### O desenho

Cada estado vai para a coluna da sua distância (em transições) a partir do inicial; dentro de cada coluna, a ordem é ajustada algumas vezes pela média da posição dos vizinhos (heurística do baricentro), o que reduz cruzamentos. As transições são curvas quadráticas: retas quando nada atrapalha, curvadas quando existe a transição de volta ou quando a reta passaria por cima de outro estado (e quanto mais longa, mais curvada). Os laços vão para o lado mais livre do estado. Nomes longos, como os pares do produto, aparecem abreviados no desenho (p0, p1, ...) e completos na tabela.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
