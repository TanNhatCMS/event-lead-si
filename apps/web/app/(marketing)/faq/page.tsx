import Link from 'next/link';

import { ArrowRight, ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@kit/ui/button';
import { Trans } from '@kit/ui/trans';

import { SitePageHeader } from '~/(marketing)/_components/site-page-header';

export const generateMetadata = async () => {
  const t = await getTranslations();

  return {
    title: t('marketing.faq'),
  };
};

async function FAQPage() {
  const t = await getTranslations();

  // Nội dung FAQ mặc định render theo ngôn ngữ mặc định (vi) — bản dịch Text
  // key nếu muốn chuyển sang i18n keys sau này (Trans dùng defaults khi thiếu key).
  const faqItems = [
    {
      question: `EventLead là gì?`,
      answer: `EventLead là công cụ quản lý khách hàng tiềm năng tại sự kiện: quét danh thiếp, quản lý danh bạ, làm giàu dữ liệu bằng AI và theo dõi quan hệ.`,
    },
    {
      question: `Quét danh thiếp hoạt động thế nào?`,
      answer: `Bạn chụp ảnh danh thiếp, AI sẽ tự động trích xuất họ tên, công ty, email, số điện thoại và lưu vào danh bạ — kèm kiểm tra trùng lặp.`,
    },
    {
      question: `Dữ liệu danh bạ của tôi lưu ở đâu?`,
      answer: `Dữ liệu được lưu an toàn trong tài khoản của bạn và chỉ mình bạn có thể xem. Bạn có thể xuất danh bạ ra file CSV bất cứ lúc nào.`,
    },
    {
      question: `Trợ lý AI có thể giúp gì?`,
      answer: `Trợ lý AI trả lời câu hỏi về khách hàng tiềm năng của bạn dựa trên dữ liệu bạn đã lưu, soạn thư theo dõi và gợi ý cách tiếp cận.`,
    },
    {
      question: `Tôi có cần thẻ tín dụng để bắt đầu không?`,
      answer: `Không. Bạn có thể tạo tài khoản và dùng thử EventLead ngay mà không cần thẻ tín dụng.`,
    },
    {
      question: `Làm sao để liên hệ hỗ trợ?`,
      answer: `Bạn có thể gửi câu hỏi qua trang Liên hệ — chúng tôi thường phản hồi trong vòng một ngày làm việc.`,
    },
  ];

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => {
      return {
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      };
    }),
  };

  return (
    <>
      <script
        key={'ld:json'}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className={'flex flex-col space-y-4 xl:space-y-8'}>
        <SitePageHeader
          title={t('marketing.faq')}
          subtitle={t('marketing.faqSubtitle')}
        />

        <div className={'container flex flex-col space-y-8 pb-16'}>
          <div className="flex w-full max-w-xl flex-col">
            {faqItems.map((item, index) => {
              return <FaqItem key={index} item={item} />;
            })}
          </div>

          <div>
            <Button
              nativeButton={false}
              render={<Link href={'/contact'} />}
              variant={'outline'}
            >
              <span>
                <Trans i18nKey={'marketing.contactFaq'} />
              </span>

              <ArrowRight className={'ml-2 w-4'} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export default FAQPage;

function FaqItem({
  item,
}: React.PropsWithChildren<{
  item: {
    question: string;
    answer: string;
  };
}>) {
  return (
    <details className={'group border-b px-2 py-4 last:border-b-transparent'}>
      <summary
        className={
          'flex items-center justify-between hover:cursor-pointer hover:underline'
        }
      >
        <h2
          className={
            'hover:underline-none cursor-pointer font-sans font-medium'
          }
        >
          <Trans i18nKey={item.question} defaults={item.question} />
        </h2>

        <div>
          <ChevronDown
            className={'h-5 transition duration-300 group-open:-rotate-180'}
          />
        </div>
      </summary>

      <div className={'text-muted-foreground flex flex-col space-y-2 py-1'}>
        <Trans i18nKey={item.answer} defaults={item.answer} />
      </div>
    </details>
  );
}
